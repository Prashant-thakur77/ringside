//! Ringside program tests on MagicSVM (base ledger + ephemeral rollup in one process).
//!
//! Covers the full match lifecycle (config, model upload, house vault, profiles, match creation and
//! delegation, joins, VRF waves, inputs, ticks with pricing, trades, every reject path, the delayed
//! book relay, private positions, settle + reveal, claims, finalize + MatchRecord action) and the
//! crank schedule. The onchain hash chain is re-derived with the shared sim crate.

use anchor_lang::{prelude::Pubkey, system_program, InstructionData, ToAccountMetas};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use magicsvm::{MagicSVM, TransactionTarget};
use ringside::state::*;
use ringside::{accounts, instruction};
use ringside_sim::bots::{Bot, Policy};
use solana_address::{address, Address};
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_native_token::LAMPORTS_PER_SOL;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::path::PathBuf;

const DLP: Address = address!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const ESPL: Address = address!("SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2");
const TOKEN: Address = address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROG: Address = address!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const VRF_PROGRAM: Address = address!("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
const EPH_QUEUE: Address = address!("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
const SLOT_HASHES: Address = address!("SysvarS1otHashes111111111111111111111111111");
const USDC: u64 = 1_000_000;
const STAKE: u64 = 5 * USDC;
const MATCH_ID: u64 = 7;

fn pk(a: &Address) -> Pubkey {
    Pubkey::new_from_array(a.to_bytes())
}
fn ad(p: &Pubkey) -> Address {
    Address::new_from_array(p.to_bytes())
}
fn pid() -> Address {
    ad(&ringside::ID)
}
fn pda(seeds: &[&[u8]], program: &Address) -> Address {
    Address::find_program_address(seeds, program).0
}
fn ata(owner: &Address, mint: &Address) -> Address {
    pda(&[owner.as_ref(), TOKEN.as_ref(), mint.as_ref()], &ATA_PROG)
}
fn eata(owner: &Address, mint: &Address) -> Address {
    pda(&[owner.as_ref(), mint.as_ref()], &ESPL)
}
fn vault(mint: &Address) -> Address {
    pda(&[mint.as_ref()], &ESPL)
}
fn buffer(acc: &Address, owner: &Address) -> Address {
    pda(&[b"buffer", acc.as_ref()], owner)
}
fn drecord(acc: &Address) -> Address {
    pda(&[b"delegation", acc.as_ref()], &DLP)
}
fn dmeta(acc: &Address) -> Address {
    pda(&[b"delegation-metadata", acc.as_ref()], &DLP)
}
fn config_pda() -> Address {
    pda(&[CONFIG_SEED], &pid())
}
fn model_pda(v: u16) -> Address {
    pda(&[MODEL_SEED, &v.to_le_bytes()], &pid())
}
fn match_pda(id: u64) -> Address {
    pda(&[MATCH_SEED, &id.to_le_bytes()], &pid())
}
fn market_pda(id: u64, mode: u8) -> Address {
    pda(&[MARKET_SEED, &id.to_le_bytes(), &[mode]], &pid())
}
fn record_pda(id: u64) -> Address {
    pda(&[RECORD_SEED, &id.to_le_bytes()], &pid())
}
fn profile_pda(w: &Address) -> Address {
    pda(&[PROFILE_SEED, w.as_ref()], &pid())
}
fn position_pda(market: &Address, owner: &Address) -> Address {
    pda(&[POSITION_SEED, market.as_ref(), owner.as_ref()], &pid())
}
fn permission_pda(acc: &Address) -> Address {
    pda(&[b"permission:", acc.as_ref()], &ad(&PERMISSION_PROGRAM_ID))
}

fn ix(data: impl InstructionData, accs: impl ToAccountMetas) -> Instruction {
    Instruction {
        program_id: pid(),
        accounts: accs
            .to_account_metas(None)
            .into_iter()
            .map(|m| AccountMeta { pubkey: ad(&m.pubkey), is_signer: m.is_signer, is_writable: m.is_writable })
            .collect(),
        data: data.data(),
    }
}

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

struct World {
    svm: MagicSVM,
    admin: Keypair,
    relay: Keypair,
    a: Keypair,
    b: Keypair,
    spec: Keypair,
    mint: Address,
    validator: Address,
}

fn unique<'a>(s: &[&'a Keypair]) -> Vec<&'a Keypair> {
    let mut v: Vec<&Keypair> = vec![];
    for k in s {
        if !v.iter().any(|x| x.pubkey() == k.pubkey()) {
            v.push(*k);
        }
    }
    v
}

impl World {
    fn tx(&mut self, target: TransactionTarget, signers: &[&Keypair], ixs: Vec<Instruction>) -> Result<Vec<String>, String> {
        let signers = unique(signers);
        let tx = Transaction::new(&signers, Message::new(&ixs, Some(&signers[0].pubkey())), self.svm.latest_blockhash_for(target));
        let r = self.svm.send_transaction_to(target, tx);
        self.svm.expire_blockhash_for(target);
        match r {
            Ok(meta) => Ok(meta.logs.clone()),
            Err(f) => Err(format!("{:?} {:#?}", f.err, f.meta.logs)),
        }
    }
    fn ok(&mut self, target: TransactionTarget, signers: &[&Keypair], ixs: Vec<Instruction>, label: &str) -> Vec<String> {
        self.tx(target, signers, ixs).unwrap_or_else(|e| panic!("{label} failed: {e}"))
    }
    fn err(&mut self, target: TransactionTarget, signers: &[&Keypair], ixs: Vec<Instruction>, code: u32, label: &str) {
        match self.tx(target, signers, ixs) {
            Ok(_) => panic!("{label}: expected error {code}, got success"),
            Err(e) => assert!(e.contains(&format!("Custom({code})")), "{label}: expected Custom({code}), got {e}"),
        }
    }
    fn account(&self, target: TransactionTarget, a: &Address) -> Vec<u8> {
        self.svm.get_account_for(target, a).unwrap_or_else(|| panic!("missing {a} on {target:?}")).data
    }
    fn game(&self) -> Match {
        *bytemuck_from::<Match>(&self.account(TransactionTarget::Ephemeral, &match_pda(MATCH_ID)))
    }
    fn market(&self, mode: u8) -> Market {
        *bytemuck_from::<Market>(&self.account(TransactionTarget::Ephemeral, &market_pda(MATCH_ID, mode)))
    }
    fn token(&self, target: TransactionTarget, a: &Address) -> u64 {
        u64::from_le_bytes(self.account(target, a)[64..72].try_into().unwrap())
    }
    fn er_clock(&mut self) -> Clock {
        self.svm.ephemeral_mut().get_sysvar::<Clock>()
    }
    fn set_er_clock(&mut self, slot: u64, unix: i64) {
        let mut c = self.er_clock();
        c.slot = slot;
        c.unix_timestamp = unix;
        self.svm.ephemeral_mut().set_sysvar(&c);
    }
}

fn bytemuck_from<T: Copy>(data: &[u8]) -> &T {
    assert!(data.len() >= 8 + core::mem::size_of::<T>());
    unsafe { &*(data[8..].as_ptr() as *const T) }
}

fn create_mint_ixs(payer: &Address, mint: &Address, rent: u64) -> Vec<Instruction> {
    let mut create = vec![0u8, 0, 0, 0];
    create.extend_from_slice(&rent.to_le_bytes());
    create.extend_from_slice(&82u64.to_le_bytes());
    create.extend_from_slice(TOKEN.as_ref());
    let mut init = vec![20u8, 6];
    init.extend_from_slice(payer.as_ref());
    init.push(0);
    vec![
        Instruction {
            program_id: solana_sdk_ids::system_program::id(),
            accounts: vec![AccountMeta::new(*payer, true), AccountMeta::new(*mint, true)],
            data: create,
        },
        Instruction { program_id: TOKEN, accounts: vec![AccountMeta::new(*mint, false)], data: init },
    ]
}

fn create_ata_ix(payer: &Address, owner: &Address, mint: &Address) -> Instruction {
    Instruction {
        program_id: ATA_PROG,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(ata(owner, mint), false),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false),
            AccountMeta::new_readonly(TOKEN, false),
        ],
        data: vec![1],
    }
}

fn mint_to_ix(mint: &Address, dest: &Address, auth: &Address, amount: u64) -> Instruction {
    let mut data = vec![7];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN,
        accounts: vec![AccountMeta::new(*mint, false), AccountMeta::new(*dest, false), AccountMeta::new_readonly(*auth, true)],
        data,
    }
}

fn init_eata_ix(payer: &Address, owner: &Address, mint: &Address) -> Instruction {
    Instruction {
        program_id: ESPL,
        accounts: vec![
            AccountMeta::new(eata(owner, mint), false),
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false),
        ],
        data: vec![0],
    }
}

fn init_vault_ix(payer: &Address, mint: &Address) -> Instruction {
    let v = vault(mint);
    Instruction {
        program_id: ESPL,
        accounts: vec![
            AccountMeta::new(v, false),
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new(eata(&v, mint), false),
            AccountMeta::new(ata(&v, mint), false),
            AccountMeta::new_readonly(TOKEN, false),
            AccountMeta::new_readonly(ATA_PROG, false),
            AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false),
        ],
        data: vec![1],
    }
}

fn transfer_to_vault_ix(owner: &Address, mint: &Address, amount: u64) -> Instruction {
    let v = vault(mint);
    let mut data = vec![2];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: ESPL,
        accounts: vec![
            AccountMeta::new(eata(owner, mint), false),
            AccountMeta::new_readonly(v, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new(ata(owner, mint), false),
            AccountMeta::new(ata(&v, mint), false),
            AccountMeta::new_readonly(*owner, true),
            AccountMeta::new_readonly(TOKEN, false),
        ],
        data,
    }
}

fn delegate_eata_ix(payer: &Address, owner: &Address, mint: &Address, validator: &Address) -> Instruction {
    let e = eata(owner, mint);
    let mut data = vec![4];
    data.extend_from_slice(validator.as_ref());
    Instruction {
        program_id: ESPL,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(e, false),
            AccountMeta::new_readonly(ESPL, false),
            AccountMeta::new(buffer(&e, &ESPL), false),
            AccountMeta::new(drecord(&e), false),
            AccountMeta::new(dmeta(&e), false),
            AccountMeta::new_readonly(DLP, false),
            AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false),
        ],
        data,
    }
}

fn config_args(relay: &Address) -> ConfigArgs {
    ConfigArgs {
        fee_bps: 100,
        tick_ms: 100,
        stale_ticks_max: 2,
        min_slot_gap: 1,
        freeze_ticks: 2,
        relay_authority: pk(relay),
        spread: SpreadArgs { s_base: 20_000, s_vol_bps: 5_000, s_time: 20_000, k_skew: 30_000, exposure_cap_per_match: 40 * USDC, max_qty: 25 },
    }
}

/// Builds the world up to a delegated, open match with funded fighters, spectator and house.
fn setup() -> World {
    let mut svm = MagicSVM::new();
    svm.add_program_from_file(pid(), root().join("target/deploy/ringside.so")).unwrap();
    svm.add_program_from_file(ad(&session_keys::ID), PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/session-keys.so")).unwrap();
    let mut c: Clock = svm.get_sysvar();
    c.unix_timestamp = 1_790_000_000;
    svm.set_sysvar(&c);
    svm.ephemeral_mut().set_sysvar(&c);
    let validator = svm.validator_identity();
    let w = World { svm, admin: Keypair::new(), relay: Keypair::new(), a: Keypair::new(), b: Keypair::new(), spec: Keypair::new(), mint: Address::default(), validator };
    let mut w = w;
    for k in [&w.admin, &w.relay, &w.a, &w.b, &w.spec] {
        w.svm.airdrop(&k.pubkey(), 20 * LAMPORTS_PER_SOL).unwrap();
    }
    let admin = w.admin.insecure_clone();
    let mint_kp = Keypair::new();
    w.mint = mint_kp.pubkey();
    let mint = w.mint;
    let rent = w.svm.minimum_balance_for_rent_exemption(82);
    w.ok(TransactionTarget::Base, &[&admin, &mint_kp], create_mint_ixs(&admin.pubkey(), &mint, rent), "mint");
    let people: Vec<Address> = [&w.admin, &w.a, &w.b, &w.spec].iter().map(|k| k.pubkey()).collect();
    let mut ixs: Vec<Instruction> = people.iter().map(|p| create_ata_ix(&admin.pubkey(), p, &mint)).collect();
    ixs.extend(people.iter().map(|p| mint_to_ix(&mint, &ata(p, &mint), &admin.pubkey(), 1_000 * USDC)));
    w.ok(TransactionTarget::Base, &[&admin], ixs, "atas");

    // Config + model.
    let cfg = config_pda();
    w.ok(
        TransactionTarget::Base,
        &[&admin],
        vec![ix(
            instruction::InitializeConfig { args: config_args(&w.relay.pubkey()) },
            accounts::InitializeConfig { admin: pk(&admin.pubkey()), config: pk(&cfg), usdc_mint: pk(&mint), system_program: system_program::ID },
        )],
        "initialize_config",
    );
    let blob = std::fs::read(root().join("ml/winprob/out/model_v1.bin")).expect("model blob (run ml/winprob/train.py)");
    let model = model_pda(1);
    w.ok(
        TransactionTarget::Base,
        &[&admin],
        vec![ix(instruction::CreateModel { version: 1 }, accounts::CreateModel { admin: pk(&admin.pubkey()), config: pk(&cfg), model: pk(&model), system_program: system_program::ID })],
        "create_model",
    );
    for (i, chunk) in blob.chunks(900).enumerate() {
        w.ok(
            TransactionTarget::Base,
            &[&admin],
            vec![ix(
                instruction::SetModelParams { version: 1, offset: (i * 900) as u32, chunk: chunk.to_vec() },
                accounts::SetModel { admin: pk(&admin.pubkey()), config: pk(&cfg), model: pk(&model) },
            )],
            "set_model_params",
        );
    }
    w.ok(
        TransactionTarget::Base,
        &[&admin],
        vec![ix(instruction::FinalizeModel { version: 1, metrics_hash: [7; 32] }, accounts::FinalizeModel { admin: pk(&admin.pubkey()), config: pk(&cfg), model: pk(&model) })],
        "finalize_model",
    );
    let stored = w.account(TransactionTarget::Base, &model);
    assert_eq!(&stored[8 + 72..8 + 72 + blob.len()], &blob[..], "model blob round-trips");

    // eSPL vault for the mint, house vault eATA, and user deposits.
    w.ok(TransactionTarget::Base, &[&admin], vec![init_vault_ix(&admin.pubkey(), &mint), create_ata_ix(&admin.pubkey(), &vault(&mint), &mint), delegate_eata_ix(&admin.pubkey(), &vault(&mint), &mint, &validator)], "espl vault");
    let house_eata = eata(&cfg, &mint);
    w.ok(
        TransactionTarget::Base,
        &[&admin],
        vec![{
            let mut i = ix(
                instruction::InitHouseVault {},
                accounts::InitHouseVault {
                    admin: pk(&admin.pubkey()),
                    config: pk(&cfg),
                    usdc_mint: pk(&mint),
                    house_eata: pk(&house_eata),
                    eata_buffer: pk(&buffer(&house_eata, &ESPL)),
                    eata_record: pk(&drecord(&house_eata)),
                    eata_metadata: pk(&dmeta(&house_eata)),
                    ephemeral_token_program: pk(&ESPL),
                    delegation_program: pk(&DLP),
                    system_program: system_program::ID,
                },
            );
            i.accounts.push(AccountMeta::new_readonly(validator, false));
            i
        }],
        "init_house_vault",
    );
    for k in [w.admin.insecure_clone(), w.a.insecure_clone(), w.b.insecure_clone(), w.spec.insecure_clone()] {
        let amount = if k.pubkey() == admin.pubkey() { 500 * USDC } else { 100 * USDC };
        w.ok(
            TransactionTarget::Base,
            &[&admin, &k],
            vec![init_eata_ix(&admin.pubkey(), &k.pubkey(), &mint), transfer_to_vault_ix(&k.pubkey(), &mint, amount), delegate_eata_ix(&admin.pubkey(), &k.pubkey(), &mint, &validator)],
            "user deposit",
        );
    }
    // House liquidity on the ER.
    w.ok(
        TransactionTarget::Ephemeral,
        &[&admin],
        vec![ix(
            instruction::TopupHouseVault { amount: 400 * USDC },
            accounts::TopupHouse { admin: pk(&admin.pubkey()), config: pk(&cfg), admin_token: pk(&ata(&admin.pubkey(), &mint)), house_token: pk(&ata(&cfg, &mint)), token_program: pk(&TOKEN) },
        )],
        "topup_house_vault",
    );
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&cfg, &mint)), 400 * USDC);

    // Profiles.
    for k in [w.a.insecure_clone(), w.b.insecure_clone()] {
        let prof = profile_pda(&k.pubkey());
        w.ok(TransactionTarget::Base, &[&admin], vec![ix(instruction::CreateProfile {}, accounts::CreateProfile { payer: pk(&admin.pubkey()), wallet: pk(&k.pubkey()), profile: pk(&prof), system_program: system_program::ID })], "create_profile");
        let mut d = ix(
            instruction::DelegateProfile {},
            accounts::DelegateProfile {
                payer: pk(&admin.pubkey()),
                wallet: pk(&k.pubkey()),
                buffer_profile: pk(&buffer(&prof, &pid())),
                delegation_record_profile: pk(&drecord(&prof)),
                delegation_metadata_profile: pk(&dmeta(&prof)),
                profile: pk(&prof),
                owner_program: ringside::ID,
                delegation_program: pk(&DLP),
                system_program: system_program::ID,
            },
        );
        d.accounts.push(AccountMeta::new_readonly(validator, false));
        w.ok(TransactionTarget::Base, &[&admin], vec![d], "delegate_profile");
    }

    // Match.
    create_and_delegate_match(&mut w, MATCH_ID);
    w
}

fn create_and_delegate_match(w: &mut World, id: u64) {
    let admin = w.admin.insecure_clone();
    let (cfg, mint, validator) = (config_pda(), w.mint, w.validator);
    let game = match_pda(id);
    let (ml, md) = (market_pda(id, MODE_LIVE), market_pda(id, MODE_DELAYED));
    let escrow_eata = eata(&game, &mint);
    w.ok(
        TransactionTarget::Base,
        &[&admin],
        vec![ix(
            instruction::CreateMatch { match_id: id, stake: STAKE, opponent: Pubkey::default(), delay_ms: 5000 },
            accounts::CreateMatch {
                creator: pk(&admin.pubkey()),
                config: pk(&cfg),
                game: pk(&game),
                market_live: pk(&ml),
                market_delayed: pk(&md),
                record: pk(&record_pda(id)),
                usdc_mint: pk(&mint),
                escrow_eata: pk(&escrow_eata),
                ephemeral_token_program: pk(&ESPL),
                system_program: system_program::ID,
            },
        )],
        "create_match",
    );
    let mut d = ix(
        instruction::DelegateMatch { match_id: id },
        accounts::DelegateMatch {
            payer: pk(&admin.pubkey()),
            buffer_game: pk(&buffer(&game, &pid())),
            delegation_record_game: pk(&drecord(&game)),
            delegation_metadata_game: pk(&dmeta(&game)),
            game: pk(&game),
            buffer_market_live: pk(&buffer(&ml, &pid())),
            delegation_record_market_live: pk(&drecord(&ml)),
            delegation_metadata_market_live: pk(&dmeta(&ml)),
            market_live: pk(&ml),
            buffer_market_delayed: pk(&buffer(&md, &pid())),
            delegation_record_market_delayed: pk(&drecord(&md)),
            delegation_metadata_market_delayed: pk(&dmeta(&md)),
            market_delayed: pk(&md),
            owner_program: ringside::ID,
            delegation_program: pk(&DLP),
            system_program: system_program::ID,
        },
    );
    d.accounts.push(AccountMeta::new_readonly(validator, false));
    let mut e = ix(
        instruction::DelegateEscrow { _match_id: id },
        accounts::DelegateEscrow {
            payer: pk(&admin.pubkey()),
            config: pk(&cfg),
            game: pk(&game),
            escrow_eata: pk(&escrow_eata),
            eata_buffer: pk(&buffer(&escrow_eata, &ESPL)),
            eata_record: pk(&drecord(&escrow_eata)),
            eata_metadata: pk(&dmeta(&escrow_eata)),
            ephemeral_token_program: pk(&ESPL),
            delegation_program: pk(&DLP),
            system_program: system_program::ID,
        },
    );
    e.accounts.push(AccountMeta::new_readonly(validator, false));
    w.ok(TransactionTarget::Base, &[&admin], vec![d, e], "delegate_match + delegate_escrow");
    assert_eq!(w.svm.get_account_for(TransactionTarget::Base, &game).unwrap().owner, DLP, "match delegated on base");
}

fn join_ix(w: &World, signer: &Address, player: &Address, id: u64) -> Instruction {
    ix(
        instruction::JoinFight { _match_id: id },
        accounts::JoinFight {
            signer: pk(signer),
            player: pk(player),
            config: pk(&config_pda()),
            game: pk(&match_pda(id)),
            player_token: pk(&ata(player, &w.mint)),
            escrow_token: pk(&ata(&match_pda(id), &w.mint)),
            token_program: pk(&TOKEN),
            session_token: None,
        },
    )
}

fn tick_ix(id: u64) -> Instruction {
    ix(instruction::Tick { _match_id: id }, accounts::Tick { config: pk(&config_pda()), model: pk(&model_pda(1)), game: pk(&match_pda(id)), market_live: pk(&market_pda(id, MODE_LIVE)) })
}

fn input_ix(player: &Address, id: u64, seq: u64, bits: u16) -> Instruction {
    ix(
        instruction::SubmitInput { _match_id: id, seq, input_bits: bits },
        accounts::SubmitInput { signer: pk(player), player: pk(player), game: pk(&match_pda(id)), session_token: None },
    )
}

#[allow(clippy::too_many_arguments)]
fn trade_ix(w: &World, trader: &Address, mode: u8, seen: u64, side: TradeSide, dir: TradeDir, qty: u64, limit: u64, record: bool) -> Instruction {
    let market = market_pda(MATCH_ID, mode);
    ix(
        instruction::Trade { _match_id: MATCH_ID, seen_tick: seen, side, dir, qty, limit_price: limit, record_rejects: record },
        accounts::Trade {
            signer: pk(trader),
            trader: pk(trader),
            config: pk(&config_pda()),
            game: pk(&match_pda(MATCH_ID)),
            market: pk(&market),
            position: pk(&position_pda(&market, trader)),
            trader_token: pk(&ata(trader, &w.mint)),
            house_token: pk(&ata(&config_pda(), &w.mint)),
            token_program: pk(&TOKEN),
            session_token: None,
        },
    )
}

fn settle_ix(w: &World, id: u64) -> Instruction {
    ix(
        instruction::Settle { match_id: id },
        accounts::Settle {
            config: pk(&config_pda()),
            game: pk(&match_pda(id)),
            market_live: pk(&market_pda(id, MODE_LIVE)),
            market_delayed: pk(&market_pda(id, MODE_DELAYED)),
            escrow_token: pk(&ata(&match_pda(id), &w.mint)),
            fighter_a_token: pk(&ata(&w.a.pubkey(), &w.mint)),
            fighter_b_token: pk(&ata(&w.b.pubkey(), &w.mint)),
            house_token: pk(&ata(&config_pda(), &w.mint)),
            profile_a: pk(&profile_pda(&w.a.pubkey())),
            profile_b: pk(&profile_pda(&w.b.pubkey())),
            token_program: pk(&TOKEN),
            permission_program: PERMISSION_PROGRAM_ID,
            ephemeral_vault: EPHEMERAL_VAULT_ID,
            magic_program: MAGIC_PROGRAM_ID,
        },
    )
}

fn join_position(w: &mut World, who: &Keypair, mode: u8) -> Address {
    let admin = w.admin.insecure_clone();
    let market = market_pda(MATCH_ID, mode);
    let pos = position_pda(&market, &who.pubkey());
    w.ok(
        TransactionTarget::Base,
        &[&admin],
        vec![
            ix(instruction::JoinPosition {}, accounts::JoinPosition { payer: pk(&admin.pubkey()), owner: pk(&who.pubkey()), market: pk(&market), position: pk(&pos), system_program: system_program::ID }),
            {
                let mut d = ix(
                    instruction::DelegatePosition {},
                    accounts::DelegatePosition {
                        payer: pk(&admin.pubkey()),
                        owner: pk(&who.pubkey()),
                        market: pk(&market),
                        buffer_position: pk(&buffer(&pos, &pid())),
                        delegation_record_position: pk(&drecord(&pos)),
                        delegation_metadata_position: pk(&dmeta(&pos)),
                        position: pk(&pos),
                        owner_program: ringside::ID,
                        delegation_program: pk(&DLP),
                        system_program: system_program::ID,
                    },
                );
                d.accounts.push(AccountMeta::new_readonly(w.validator, false));
                d
            },
        ],
        "join_position + delegate",
    );
    w.ok(
        TransactionTarget::Ephemeral,
        &[&admin],
        vec![ix(
            instruction::InitPositionPermission {},
            accounts::PositionPermission {
                payer: pk(&admin.pubkey()),
                config: pk(&config_pda()),
                position: pk(&pos),
                permission: pk(&permission_pda(&pos)),
                permission_program: PERMISSION_PROGRAM_ID,
                ephemeral_vault: EPHEMERAL_VAULT_ID,
                magic_program: MAGIC_PROGRAM_ID,
            },
        )],
        "init_position_permission",
    );
    pos
}

/// Advances the ER clock one slot (and the wall clock far enough) and runs one tick.
fn do_tick(w: &mut World) -> Result<Vec<String>, String> {
    let c = w.er_clock();
    w.set_er_clock(c.slot + 1, c.unix_timestamp);
    let admin = w.admin.insecure_clone();
    w.tx(TransactionTarget::Ephemeral, &[&admin], vec![tick_ix(MATCH_ID)])
}

fn request_wave(w: &mut World) {
    let admin = w.admin.insecure_clone();
    let i = ix(
        instruction::RequestWaveRandomness { match_id: MATCH_ID },
        accounts::RequestWave {
            payer: pk(&admin.pubkey()),
            game: pk(&match_pda(MATCH_ID)),
            oracle_queue: pk(&EPH_QUEUE),
            program_identity: pk(&ad(&ringside::VRF_IDENTITY)),
            vrf_program: pk(&VRF_PROGRAM),
            slot_hashes: pk(&SLOT_HASHES),
            system_program: system_program::ID,
        },
    );
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![i], "request_wave_randomness");
    let slot = w.er_clock().slot;
    for r in w.svm.warp_to_slot(slot + 1) {
        if let Err(f) = r {
            panic!("vrf callback failed: {:?} {:#?}", f.err, f.meta.logs);
        }
    }
}

fn consumed(logs: &[String]) -> Option<u64> {
    let me = format!("Program {} consumed ", ringside::ID);
    logs.iter().rev().find_map(|l| l.strip_prefix(&me).and_then(|r| r.split(' ').next()).and_then(|n| n.parse().ok()))
}

const E_STALE: u32 = 6000;
const E_FIGHTER: u32 = 6001;
const E_SLIPPAGE: u32 = 6002;
const E_EXPOSURE: u32 = 6003;
const E_CLOSED: u32 = 6004;
const E_NOT_FIGHTER: u32 = 6005;
const E_BAD_SEQ: u32 = 6006;
const E_TOO_EARLY: u32 = 6007;
const E_UNAUTH: u32 = 6015;

#[test]
fn full_match_lifecycle() {
    let mut w = setup();
    let (a, b, spec, admin, relay) = (w.a.insecure_clone(), w.b.insecure_clone(), w.spec.insecure_clone(), w.admin.insecure_clone(), w.relay.insecure_clone());
    let mint = w.mint;

    // Positions exist before the bell; ticking a lobby match is rejected.
    let pos_live = join_position(&mut w, &spec, MODE_LIVE);
    let pos_delayed = join_position(&mut w, &spec, MODE_DELAYED);
    let pos_fighter = join_position(&mut w, &a, MODE_LIVE);
    w.err(TransactionTarget::Ephemeral, &[&admin], vec![tick_ix(MATCH_ID)], E_CLOSED, "tick in lobby");

    // Fighters join; stakes move to escrow; the match goes live.
    let a_before = w.token(TransactionTarget::Ephemeral, &ata(&a.pubkey(), &mint));
    let ja = join_ix(&w, &a.pubkey(), &a.pubkey(), MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&a], vec![ja], "join A");
    let ja2 = join_ix(&w, &a.pubkey(), &a.pubkey(), MATCH_ID);
    w.err(TransactionTarget::Ephemeral, &[&a], vec![ja2], 6017, "A joins twice");
    let jb = join_ix(&w, &b.pubkey(), &b.pubkey(), MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&b], vec![jb], "join B");
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&match_pda(MATCH_ID), &mint)), 2 * STAKE);
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&a.pubkey(), &mint)), a_before - STAKE);
    let g = w.game();
    assert_eq!(g.status, ST_LIVE);
    let init_state = ringside_sim::decode(&g.sim).unwrap();
    assert_eq!(g.state_hash, ringside_sim::genesis_hash(&init_state), "genesis via syscall == sha2");

    // VRF for wave 0 arrives through the ephemeral queue callback.
    request_wave(&mut w);
    let g = w.game();
    assert_eq!(g.vrf_fulfilled_wave, 0);
    assert_eq!(g.n_vrf, 1);
    let seed0: [u8; 32] = g.sim[ringside::SIM_SEED_OFFSET..ringside::SIM_SEED_OFFSET + 32].try_into().unwrap();
    assert_ne!(seed0, [0u8; 32]);

    // Inputs: only fighters, monotonic, one per tick.
    w.err(TransactionTarget::Ephemeral, &[&spec], vec![input_ix(&spec.pubkey(), MATCH_ID, 1, 0)], E_NOT_FIGHTER, "spectator input");
    w.ok(TransactionTarget::Ephemeral, &[&a], vec![input_ix(&a.pubkey(), MATCH_ID, 1, 0x0010)], "input A");
    w.err(TransactionTarget::Ephemeral, &[&a], vec![input_ix(&a.pubkey(), MATCH_ID, 2, 0x0010)], E_BAD_SEQ, "second input same tick");
    w.err(TransactionTarget::Ephemeral, &[&a], vec![input_ix(&a.pubkey(), MATCH_ID, 1, 0x0010)], E_BAD_SEQ, "non-monotonic seq");

    // Time gate: same slot → too early.
    let c = w.er_clock();
    w.set_er_clock(c.slot + 1, c.unix_timestamp);
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![tick_ix(MATCH_ID)], "tick 1");
    w.err(TransactionTarget::Ephemeral, &[&admin], vec![tick_ix(MATCH_ID)], E_TOO_EARLY, "tick twice in one slot");
    // Wall-clock bound: game time cannot run ahead of real time by more than a second.
    let mut gated = 0;
    for _ in 0..30 {
        if do_tick(&mut w).is_err() {
            gated += 1;
        }
    }
    assert!(gated > 0, "wall-clock gate must stop a burst of ticks");
    let start = w.game().start_unix;

    // Track inputs per tick to re-derive the hash chain off-chain.
    let mut inputs_log: Vec<[u16; 2]> = vec![];
    let mut seeds: Vec<ringside_sim::SeedEvent> = vec![ringside_sim::SeedEvent { apply_at_tick: 1, seed: seed0 }];
    // Re-read the ticks already executed.
    let executed = w.game().tick();
    assert!(executed >= 1);
    // We cannot know the earlier ticks' inputs from state alone, so restart verification from a
    // checkpoint: the hash chain continues from the current onchain hash.
    let mut chain_state = ringside_sim::decode(&w.game().sim).unwrap();
    let mut chain_hash = w.game().state_hash;
    let _ = (&mut inputs_log, &mut seeds);

    // Drive the fight with scripted bots until a few hits land and prices move.
    let mut bot_a = Bot::new(Policy::Aggressive, 950, 11);
    let mut bot_b = Bot::new(Policy::Random, 600, 12);
    let mut seq = [10u64, 10u64];
    let mut unix = start;
    let mut traded = false;
    let mut saw_stale = false;
    let mut checked_relay = false;
    let mut lethal_freeze_seen = false;
    let mut tick_cu: Vec<u64> = vec![];
    let mut trade_cu: Vec<u64> = vec![];
    for step in 0..1400u32 {
        let g = w.game();
        if g.status != ST_LIVE && g.status != ST_SUDDEN_DEATH {
            break;
        }
        let s = ringside_sim::decode(&g.sim).unwrap();
        let ia = bot_a.act(&s, 0);
        let ib = bot_b.act(&s, 1);
        seq[0] += 1;
        seq[1] += 1;
        w.ok(TransactionTarget::Ephemeral, &[&a, &b], vec![input_ix(&a.pubkey(), MATCH_ID, seq[0], ia), input_ix(&b.pubkey(), MATCH_ID, seq[1], ib)], "inputs");
        if s.wave_index != g.vrf_requested_wave && s.wave_index < 6 && g.vrf_requested_wave != s.wave_index {
            request_wave(&mut w);
            let g2 = w.game();
            let seed: [u8; 32] = g2.sim[ringside::SIM_SEED_OFFSET..ringside::SIM_SEED_OFFSET + 32].try_into().unwrap();
            chain_state.vrf_seed = seed;
        }
        // Keep the wall clock ahead of game time so only the slot gate applies.
        if step % 10 == 0 {
            unix += 1;
        }
        let c = w.er_clock();
        w.set_er_clock(c.slot + 1, unix.max(start + (step as i64) / 10 + 1));
        let logs = w.ok(TransactionTarget::Ephemeral, &[&admin], vec![tick_ix(MATCH_ID)], "tick");
        if let Some(cu) = consumed(&logs) {
            tick_cu.push(cu);
        }
        let g = w.game();
        ringside_sim::step(&mut chain_state, [ia & 0x0f7f, ib & 0x0f7f]);
        chain_hash = ringside_sim::hash_link(&chain_hash, chain_state.tick as u64, &ringside_sim::encode(&chain_state));
        assert_eq!(chain_hash, g.state_hash, "hash chain diverged at tick {}", g.tick());

        let m = w.market(MODE_LIVE);
        if g.status == ST_LIVE || g.status == ST_SUDDEN_DEATH {
            assert_eq!(m.last_priced_tick, g.tick() as u64, "book priced in the same instruction as the tick");
            assert!(m.bid_a < m.ask_a && m.bid_a >= 10_000 && m.ask_a <= 990_000);
            if m.frozen_until_tick > m.last_priced_tick && !lethal_freeze_seen {
                lethal_freeze_seen = true;
                let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, m.last_priced_tick, TradeSide::A, TradeDir::Buy, 1, USDC, false);
                w.err(TransactionTarget::Ephemeral, &[&spec], vec![t], 6012, "frozen after lethal-range hit");
            }
        }
        if g.tick() == 30 && !traded && m.frozen_until_tick <= m.last_priced_tick {
            traded = true;
            let tick = m.last_priced_tick;
            let spec_before = w.token(TransactionTarget::Ephemeral, &ata(&spec.pubkey(), &mint));
            // Fill at the current tick.
            let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, tick, TradeSide::A, TradeDir::Buy, 10, m.ask_a, false);
            let logs = w.ok(TransactionTarget::Ephemeral, &[&spec], vec![t], "buy A");
            trade_cu.extend(consumed(&logs));
            let m2 = w.market(MODE_LIVE);
            assert_eq!(m2.inv_a, 10);
            assert_eq!(m2.n_trades, 1);
            assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&spec.pubkey(), &mint)), spec_before - 10 * m.ask_a);
            // Sell some back.
            let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, tick, TradeSide::A, TradeDir::Sell, 2, 0, false);
            w.ok(TransactionTarget::Ephemeral, &[&spec], vec![t], "sell A");
            // Stale: seen 3 ticks behind with max 2.
            let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, tick - 3, TradeSide::B, TradeDir::Buy, 1, USDC, false);
            w.err(TransactionTarget::Ephemeral, &[&spec], vec![t], E_STALE, "stale tick");
            // Recorded rejection: tx succeeds, counter increments, no fill.
            let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, tick - 3, TradeSide::B, TradeDir::Buy, 1, USDC, true);
            w.ok(TransactionTarget::Ephemeral, &[&spec], vec![t], "stale tick recorded");
            assert_eq!(w.market(MODE_LIVE).n_rejected_stale, 1);
            assert_eq!(w.market(MODE_LIVE).n_trades, 2);
            saw_stale = true;
            // Fighter barred (fighter A trading its own match).
            let t = trade_ix(&w, &a.pubkey(), MODE_LIVE, tick, TradeSide::A, TradeDir::Buy, 1, USDC, false);
            w.err(TransactionTarget::Ephemeral, &[&a], vec![t], E_FIGHTER, "fighter barred");
            let _ = pos_fighter;
            // Slippage: limit below ask.
            let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, tick, TradeSide::B, TradeDir::Buy, 1, m.ask_b - 1, false);
            w.err(TransactionTarget::Ephemeral, &[&spec], vec![t], E_SLIPPAGE, "slippage");
            // Exposure: cap 40 USDC; a large A buy pushes worst-case loss over it.
            for _ in 0..4 {
                let m3 = w.market(MODE_LIVE);
                let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, m3.last_priced_tick, TradeSide::A, TradeDir::Buy, 25, USDC, false);
                if w.tx(TransactionTarget::Ephemeral, &[&spec], vec![t]).is_err() {
                    break;
                }
            }
            let m3 = w.market(MODE_LIVE);
            let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, m3.last_priced_tick, TradeSide::A, TradeDir::Buy, 25, USDC, false);
            w.err(TransactionTarget::Ephemeral, &[&spec], vec![t], E_EXPOSURE, "exposure cap");
            assert!(w.market(MODE_LIVE).max_exposure_seen <= 40 * USDC);

            // Private position: only the owner (and the house authority) can read it on the ER.
            w.svm.set_authorized_user(None);
            assert!(w.svm.get_account_for(TransactionTarget::Ephemeral, &pos_live).is_none(), "unauthenticated read denied");
            w.svm.set_authorized_user(Some(b.pubkey()));
            assert!(w.svm.get_account_for(TransactionTarget::Ephemeral, &pos_live).is_none(), "opposing fighter denied");
            w.svm.set_authorized_user(Some(spec.pubkey()));
            assert!(w.svm.get_account_for(TransactionTarget::Ephemeral, &pos_live).is_some(), "owner can read");
            w.svm.set_authorized_user(None);
            assert!(w.svm.get_account_for(TransactionTarget::Ephemeral, &market_pda(MATCH_ID, MODE_LIVE)).is_some(), "market is public");
            w.svm.set_authorized_user(Some(spec.pubkey()));
        }
        if g.tick() == 60 && !checked_relay {
            checked_relay = true;
            // Delayed book: only the relay may post; it prices from old features.
            let old = ringside_sim::features(&chain_state);
            let r = |signer: &Keypair| {
                ix(
                    instruction::RelayDelayedState { _match_id: MATCH_ID, tick: 10, features: old, time_left_ms: 89_000, lethal: false },
                    accounts::RelayDelayed { relay: pk(&signer.pubkey()), config: pk(&config_pda()), model: pk(&model_pda(1)), market_delayed: pk(&market_pda(MATCH_ID, MODE_DELAYED)) },
                )
            };
            w.err(TransactionTarget::Ephemeral, &[&spec], vec![r(&spec)], E_UNAUTH, "relay by non-relay");
            w.ok(TransactionTarget::Ephemeral, &[&relay], vec![r(&relay)], "relay");
            let md = w.market(MODE_DELAYED);
            assert_eq!(md.last_priced_tick, 10);
            // The delayed book accepts a fill priced off tick 10 while the game is at tick 60:
            // it cannot know its feed is late. This is the courtsiding window.
            let t = trade_ix(&w, &spec.pubkey(), MODE_DELAYED, 10, TradeSide::A, TradeDir::Buy, 3, USDC, false);
            w.ok(TransactionTarget::Ephemeral, &[&spec], vec![t], "delayed book fill on old tick");
            // The live book rejects the same seen_tick.
            let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, 10, TradeSide::A, TradeDir::Buy, 3, USDC, false);
            w.err(TransactionTarget::Ephemeral, &[&spec], vec![t], E_STALE, "live book rejects old tick");
        }
    }
    assert!(traded && saw_stale && checked_relay);
    tick_cu.sort();
    let p = |q: f64| tick_cu[((tick_cu.len() - 1) as f64 * q) as usize];
    let report = format!("{{\"tick_cu_p50\":{},\"tick_cu_p99\":{},\"tick_cu_max\":{},\"trade_cu\":{},\"ticks_measured\":{}}}", p(0.5), p(0.99), tick_cu[tick_cu.len() - 1], trade_cu[0], tick_cu.len());
    std::fs::create_dir_all(root().join("eval/results")).unwrap();
    std::fs::write(root().join("eval/results/cu_magicsvm.json"), &report).unwrap();
    println!("CU {report}");
    assert!(tick_cu[tick_cu.len() - 1] < 200_000, "tick fits the default compute budget");
    let g = w.game();
    assert!(g.status == ST_CLOSED, "match ended, status {}", g.status);
    assert!(g.winner != 0);
    let m = w.market(MODE_LIVE);
    assert_eq!(m.status, MK_CLOSED);
    // Trading after the bell is closed.
    let t = trade_ix(&w, &spec.pubkey(), MODE_LIVE, m.last_priced_tick, TradeSide::A, TradeDir::Buy, 1, USDC, false);
    w.err(TransactionTarget::Ephemeral, &[&spec], vec![t], E_CLOSED, "closed after the bell");
    // Ticks after the end are harmless no-ops.
    do_tick(&mut w).expect("tick after end is a no-op");

    // Settle: fighter payout, fee, profiles, reveal of the passed positions.
    let winner_key = if g.winner == ringside_sim::WINNER_A { a.pubkey() } else { b.pubkey() };
    let wb = w.token(TransactionTarget::Ephemeral, &ata(&winner_key, &mint));
    let mut s = settle_ix(&w, MATCH_ID);
    for p in [pos_live, pos_delayed] {
        s.accounts.push(AccountMeta::new(p, false));
        s.accounts.push(AccountMeta::new(permission_pda(&p), false));
    }
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![s], "settle");
    let g = w.game();
    assert!(g.status == ST_SETTLED || g.status == ST_DRAW);
    if g.status == ST_SETTLED {
        assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&winner_key, &mint)), wb + 2 * STAKE - 2 * STAKE / 100);
        assert_eq!(w.market(MODE_LIVE).fee_accrued, 2 * STAKE / 100);
    }
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&match_pda(MATCH_ID), &mint)), 0);
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![settle_ix(&w, MATCH_ID)], "settle is idempotent");
    // Reveal: anyone can read the positions now.
    w.svm.set_authorized_user(None);
    assert!(w.svm.get_account_for(TransactionTarget::Ephemeral, &pos_live).is_some(), "revealed after settle");
    w.svm.set_authorized_user(Some(spec.pubkey()));

    // Claims pay winning shares 1 USDC each, once.
    let before = w.token(TransactionTarget::Ephemeral, &ata(&spec.pubkey(), &mint));
    let pos_data = w.account(TransactionTarget::Ephemeral, &pos_live);
    let shares_a = u64::from_le_bytes(pos_data[8 + 64..8 + 72].try_into().unwrap());
    let shares_b = u64::from_le_bytes(pos_data[8 + 72..8 + 80].try_into().unwrap());
    let claim = |w: &World| {
        ix(
            instruction::Claim { _match_id: MATCH_ID },
            accounts::Claim {
                config: pk(&config_pda()),
                market: pk(&market_pda(MATCH_ID, MODE_LIVE)),
                position: pk(&pos_live),
                owner_token: pk(&ata(&spec.pubkey(), &w.mint)),
                house_token: pk(&ata(&config_pda(), &w.mint)),
                token_program: pk(&TOKEN),
            },
        )
    };
    let c1 = claim(&w);
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![c1], "claim");
    let expected = match g.winner {
        ringside_sim::WINNER_A => shares_a * USDC,
        ringside_sim::WINNER_B => shares_b * USDC,
        _ => i64::from_le_bytes(pos_data[8 + 80..8 + 88].try_into().unwrap()).max(0) as u64,
    };
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&spec.pubkey(), &mint)), before + expected);
    let c2 = claim(&w);
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![c2], "claim twice is a no-op");
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&spec.pubkey(), &mint)), before + expected);

    // Finalize: commit + Magic Action writes the MatchRecord on the base layer.
    let f = ix(
        instruction::Finalize { match_id: MATCH_ID },
        accounts::Finalize {
            payer: pk(&admin.pubkey()),
            game: pk(&match_pda(MATCH_ID)),
            market_live: pk(&market_pda(MATCH_ID, MODE_LIVE)),
            market_delayed: pk(&market_pda(MATCH_ID, MODE_DELAYED)),
            record: pk(&record_pda(MATCH_ID)),
            program_id: ringside::ID,
            magic_program: MAGIC_PROGRAM_ID,
            magic_context: pk(&ad(&MAGIC_CONTEXT_ID)),
        },
    );
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![f], "finalize");
    let slot = w.er_clock().slot;
    let _ = w.svm.warp_to_slot(slot + 2);
    let rec = w.account(TransactionTarget::Base, &record_pda(MATCH_ID));
    let written = rec[8 + 32 + 32 + 8 * 9 + 1];
    assert_eq!(written, 1, "MatchRecord written by the post-commit action");
    assert_eq!(&rec[8 + 32..8 + 64], &w.game().state_hash, "record carries the final hash");

    // Admin withdraws the fighter fee; cleanup crank commits + undelegates settled positions.
    let fee = w.market(MODE_LIVE).fee_accrued;
    let admin_before = w.token(TransactionTarget::Ephemeral, &ata(&admin.pubkey(), &mint));
    let wf = ix(
        instruction::WithdrawFees { _match_id: MATCH_ID },
        accounts::WithdrawFees { admin: pk(&admin.pubkey()), config: pk(&config_pda()), market_live: pk(&market_pda(MATCH_ID, MODE_LIVE)), admin_token: pk(&ata(&admin.pubkey(), &mint)), house_token: pk(&ata(&config_pda(), &mint)), token_program: pk(&TOKEN) },
    );
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![wf], "withdraw_fees");
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&admin.pubkey(), &mint)), admin_before + fee);
    let mut cl = ix(
        instruction::CleanupPositions { _match_id: MATCH_ID },
        accounts::Cleanup { payer: pk(&admin.pubkey()), game: pk(&match_pda(MATCH_ID)), market_delayed: pk(&market_pda(MATCH_ID, MODE_DELAYED)), magic_program: MAGIC_PROGRAM_ID, magic_context: pk(&ad(&MAGIC_CONTEXT_ID)) },
    );
    cl.accounts.push(AccountMeta::new(pos_live, false));
    cl.accounts.push(AccountMeta::new(market_pda(MATCH_ID, MODE_DELAYED), false));
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![cl], "cleanup_positions");
    let slot = w.er_clock().slot;
    let _ = w.svm.warp_to_slot(slot + 2);
    assert_eq!(w.svm.get_account_for(TransactionTarget::Base, &pos_live).unwrap().owner, pid(), "position undelegated back to the program");

    // Direct calls to the action handler are rejected (escrow signer missing).
    let direct = ix(
        instruction::WriteMatchRecord {
            args: RecordArgs { match_id: MATCH_ID, final_hash: [0; 32], ticks: 0, volume_live: 0, volume_delayed: 0, house_pnl_live: 0, house_pnl_delayed: 0, start_unix: 0, end_unix: 0, winner: 0 },
        },
        accounts::WriteMatchRecord {
            record: pk(&record_pda(MATCH_ID)),
            source_program: ringside::ID,
            escrow_auth: pk(&admin.pubkey()),
            escrow: pk(&ad(&ephemeral_rollups_sdk::pda::ephemeral_balance_pda_from_payer(&pk(&admin.pubkey()), 255))),
        },
    );
    let mut direct = direct;
    for m in direct.accounts.iter_mut() {
        if m.pubkey != admin.pubkey() {
            m.is_signer = false; // a direct caller cannot sign for the escrow PDA
        }
    }
    let r = w.tx(TransactionTarget::Base, &[&admin], vec![direct]);
    assert!(r.is_err(), "direct write_match_record must fail");
    assert!(r.unwrap_err().contains("Custom(6015)"), "rejected as unauthorized");
}

#[test]
fn crank_schedules_ticks_with_derived_task_id() {
    let mut w = setup();
    let (a, b, admin) = (w.a.insecure_clone(), w.b.insecure_clone(), w.admin.insecure_clone());
    let ja = join_ix(&w, &a.pubkey(), &a.pubkey(), MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&a], vec![ja], "join A");
    let jb = join_ix(&w, &b.pubkey(), &b.pubkey(), MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&b], vec![jb], "join B");
    let start = w.game().start_unix;
    let c = w.er_clock();
    w.set_er_clock(c.slot, start + 100);
    let sched = ix(
        instruction::ScheduleTick { match_id: MATCH_ID, interval_ms: 100, iterations: 50 },
        accounts::ScheduleTick {
            payer: pk(&admin.pubkey()),
            magic_program: MAGIC_PROGRAM_ID,
            program: ringside::ID,
            config: pk(&config_pda()),
            model: pk(&model_pda(1)),
            game: pk(&match_pda(MATCH_ID)),
            market_live: pk(&market_pda(MATCH_ID, MODE_LIVE)),
            market_delayed: pk(&market_pda(MATCH_ID, MODE_DELAYED)),
            escrow_token: pk(&ata(&match_pda(MATCH_ID), &w.mint)),
            fighter_a_token: pk(&ata(&a.pubkey(), &w.mint)),
            fighter_b_token: pk(&ata(&b.pubkey(), &w.mint)),
            house_token: pk(&ata(&config_pda(), &w.mint)),
            profile_a: pk(&profile_pda(&a.pubkey())),
            profile_b: pk(&profile_pda(&b.pubkey())),
            token_program: pk(&TOKEN),
            permission_program: PERMISSION_PROGRAM_ID,
            ephemeral_vault: EPHEMERAL_VAULT_ID,
        },
    );
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![sched], "schedule_tick");
    let t0 = w.game().tick();
    let slot = w.er_clock().slot;
    let results = w.svm.warp_to_slot(slot + 60);
    let ok = results.iter().filter(|r| r.is_ok()).count();
    let t1 = w.game().tick();
    assert!(t1 > t0, "crank advanced the match: {t0} -> {t1} ({ok} successful crank runs of {})", results.len());
    assert_eq!(ringside::task_id_for(MATCH_ID), ringside::task_id_for(MATCH_ID));
    assert_ne!(ringside::task_id_for(MATCH_ID), ringside::task_id_for(MATCH_ID + 1));
    assert!(ringside::task_id_for(MATCH_ID) > 0);
}

#[test]
fn admin_paths_and_pause() {
    let mut w = setup();
    let (a, admin, spec) = (w.a.insecure_clone(), w.admin.insecure_clone(), w.spec.insecure_clone());
    let cfg = config_pda();
    // Only the admin can pause.
    let p = |who: &Keypair, paused: bool| ix(instruction::Pause { paused }, accounts::AdminConfig { admin: pk(&who.pubkey()), config: pk(&cfg) });
    assert!(w.tx(TransactionTarget::Base, &[&spec], vec![p(&spec, true)]).is_err());
    w.ok(TransactionTarget::Base, &[&admin], vec![p(&admin, true)], "pause");
    // Config is read on the ER (cloned from base): joins are rejected while paused.
    let ja = join_ix(&w, &a.pubkey(), &a.pubkey(), MATCH_ID);
    let r = w.tx(TransactionTarget::Ephemeral, &[&a], vec![ja]);
    assert!(r.is_err() && r.unwrap_err().contains("Custom(6009)"), "paused join rejected");
    w.ok(TransactionTarget::Base, &[&admin], vec![p(&admin, false)], "unpause");
    // Spread params update.
    let sp = SpreadArgs { s_base: 30_000, s_vol_bps: 4_000, s_time: 10_000, k_skew: 20_000, exposure_cap_per_match: 50 * USDC, max_qty: 20 };
    w.ok(TransactionTarget::Base, &[&admin], vec![ix(instruction::SetSpreadParams { args: sp }, accounts::AdminConfig { admin: pk(&admin.pubkey()), config: pk(&cfg) })], "set_spread_params");
    let data = w.account(TransactionTarget::Base, &cfg);
    let s_base = u64::from_le_bytes(data[8 + 128 + 16..8 + 128 + 24].try_into().unwrap());
    assert_eq!(s_base, 30_000);
}

#[test]
fn spoofed_vrf_callback_is_rejected() {
    let mut w = setup();
    let (a, b, admin) = (w.a.insecure_clone(), w.b.insecure_clone(), w.admin.insecure_clone());
    let ja = join_ix(&w, &a.pubkey(), &a.pubkey(), MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&a], vec![ja], "join A");
    let jb = join_ix(&w, &b.pubkey(), &b.pubkey(), MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&b], vec![jb], "join B");
    request_wave(&mut w);
    let fake = Keypair::new();
    w.svm.airdrop(&fake.pubkey(), LAMPORTS_PER_SOL).unwrap();
    let spoof = ix(instruction::VrfCallback { randomness: [9; 32], wave: 1 }, accounts::VrfCallback { vrf_program_identity: pk(&fake.pubkey()), game: pk(&match_pda(MATCH_ID)) });
    w.err(TransactionTarget::Ephemeral, &[&fake], vec![spoof], 6008, "spoofed callback");
    let _ = admin;
}

#[test]
fn draw_refunds_both_stakes() {
    let mut w = setup();
    let (a, b, admin) = (w.a.insecure_clone(), w.b.insecure_clone(), w.admin.insecure_clone());
    let ja = join_ix(&w, &a.pubkey(), &a.pubkey(), MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&a], vec![ja], "join A");
    let jb = join_ix(&w, &b.pubkey(), &b.pubkey(), MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&b], vec![jb], "join B");
    let (ab, bb) = (w.token(TransactionTarget::Ephemeral, &ata(&a.pubkey(), &w.mint)), w.token(TransactionTarget::Ephemeral, &ata(&b.pubkey(), &w.mint)));
    let start = w.game().start_unix;
    // Nobody moves or fires: regulation ends level, sudden death ends level, draw.
    for _ in 0..1100 {
        let g = w.game();
        if g.status == ST_CLOSED {
            break;
        }
        let c = w.er_clock();
        w.set_er_clock(c.slot + 1, start + 200);
        w.ok(TransactionTarget::Ephemeral, &[&admin], vec![tick_ix(MATCH_ID)], "tick");
    }
    let g = w.game();
    assert_eq!(g.status, ST_CLOSED);
    assert_eq!(g.winner, ringside_sim::WINNER_DRAW);
    assert_eq!(g.tick(), 1000, "90 s regulation + 10 s sudden death at 100 ms");
    let s = settle_ix(&w, MATCH_ID);
    w.ok(TransactionTarget::Ephemeral, &[&admin], vec![s], "settle draw");
    assert_eq!(w.game().status, ST_DRAW);
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&a.pubkey(), &w.mint)), ab + STAKE);
    assert_eq!(w.token(TransactionTarget::Ephemeral, &ata(&b.pubkey(), &w.mint)), bb + STAKE);
    let prof = w.account(TransactionTarget::Ephemeral, &profile_pda(&a.pubkey()));
    assert_eq!(u32::from_le_bytes(prof[8 + 44..8 + 48].try_into().unwrap()), 1, "matches counted");
}
