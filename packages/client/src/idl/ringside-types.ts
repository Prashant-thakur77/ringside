/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ringside.json`.
 */
export type Ringside = {
  "address": "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej",
  "metadata": {
    "name": "ringside",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Ringside: onchain duel + in-play win market on MagicBlock ephemeral rollups"
  },
  "instructions": [
    {
      "name": "claim",
      "docs": [
        "Pays a settled position: winning shares 1 USDC each, a draw refunds net cost.",
        "Idempotent; anyone may trigger it and funds only go to the owner's token account."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cleanupPositions",
      "docs": [
        "Cleanup crank: commits and undelegates settled positions (remaining accounts) in a batch."
      ],
      "discriminator": [
        87,
        226,
        143,
        67,
        131,
        213,
        30,
        233
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "marketDelayed"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "commitMatch",
      "docs": [
        "Commits the final match state (sim, hash chain head, result) to Solana. Permissionless",
        "after settlement; used by the finalizer right after `finalize`."
      ],
      "discriminator": [
        175,
        146,
        74,
        234,
        39,
        25,
        248,
        114
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createMatch",
      "docs": [
        "Creates a match, both books, the base-layer MatchRecord and the escrow eATA."
      ],
      "discriminator": [
        107,
        2,
        184,
        145,
        70,
        142,
        17,
        165
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "marketLive",
          "writable": true
        },
        {
          "name": "marketDelayed",
          "writable": true
        },
        {
          "name": "record",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "escrowEata",
          "writable": true
        },
        {
          "name": "ephemeralTokenProgram",
          "address": "SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "opponent",
          "type": "pubkey"
        },
        {
          "name": "delayMs",
          "type": "u32"
        }
      ]
    },
    {
      "name": "createModel",
      "discriminator": [
        212,
        233,
        41,
        219,
        130,
        212,
        212,
        229
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "model",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "version"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "version",
          "type": "u16"
        }
      ]
    },
    {
      "name": "createProfile",
      "discriminator": [
        225,
        205,
        234,
        143,
        17,
        186,
        50,
        220
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet"
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegateEscrow",
      "docs": [
        "Delegates the match escrow eATA (fighter stakes) to the TEE validator."
      ],
      "discriminator": [
        85,
        42,
        67,
        11,
        205,
        0,
        187,
        96
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "escrowEata",
          "writable": true
        },
        {
          "name": "eataBuffer",
          "writable": true
        },
        {
          "name": "eataRecord",
          "writable": true
        },
        {
          "name": "eataMetadata",
          "writable": true
        },
        {
          "name": "ephemeralTokenProgram",
          "address": "SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegateMatch",
      "docs": [
        "Delegates the match and both books to the TEE validator (first remaining account)."
      ],
      "discriminator": [
        30,
        116,
        9,
        69,
        147,
        61,
        133,
        238
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferGame",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                54,
                57,
                95,
                121,
                229,
                152,
                175,
                160,
                171,
                239,
                252,
                136,
                45,
                184,
                220,
                117,
                43,
                17,
                143,
                161,
                135,
                145,
                235,
                131,
                253,
                18,
                93,
                51,
                51,
                199,
                93,
                4
              ]
            }
          }
        },
        {
          "name": "delegationRecordGame",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "game"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataGame",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "bufferMarketLive",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "marketLive"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                54,
                57,
                95,
                121,
                229,
                152,
                175,
                160,
                171,
                239,
                252,
                136,
                45,
                184,
                220,
                117,
                43,
                17,
                143,
                161,
                135,
                145,
                235,
                131,
                253,
                18,
                93,
                51,
                51,
                199,
                93,
                4
              ]
            }
          }
        },
        {
          "name": "delegationRecordMarketLive",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "marketLive"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMarketLive",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "marketLive"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "marketLive",
          "writable": true
        },
        {
          "name": "bufferMarketDelayed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "marketDelayed"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                54,
                57,
                95,
                121,
                229,
                152,
                175,
                160,
                171,
                239,
                252,
                136,
                45,
                184,
                220,
                117,
                43,
                17,
                143,
                161,
                135,
                145,
                235,
                131,
                253,
                18,
                93,
                51,
                51,
                199,
                93,
                4
              ]
            }
          }
        },
        {
          "name": "delegationRecordMarketDelayed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "marketDelayed"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMarketDelayed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "marketDelayed"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "marketDelayed",
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegatePosition",
      "discriminator": [
        194,
        231,
        117,
        130,
        72,
        142,
        185,
        112
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "market"
        },
        {
          "name": "bufferPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                54,
                57,
                95,
                121,
                229,
                152,
                175,
                160,
                171,
                239,
                252,
                136,
                45,
                184,
                220,
                117,
                43,
                17,
                143,
                161,
                135,
                145,
                235,
                131,
                253,
                18,
                93,
                51,
                51,
                199,
                93,
                4
              ]
            }
          }
        },
        {
          "name": "delegationRecordPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegateProfile",
      "discriminator": [
        197,
        115,
        194,
        166,
        110,
        39,
        73,
        134
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet"
        },
        {
          "name": "bufferProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "profile"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                54,
                57,
                95,
                121,
                229,
                152,
                175,
                160,
                171,
                239,
                252,
                136,
                45,
                184,
                220,
                117,
                43,
                17,
                143,
                161,
                135,
                145,
                235,
                131,
                253,
                18,
                93,
                51,
                51,
                199,
                93,
                4
              ]
            }
          }
        },
        {
          "name": "delegationRecordProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "profile"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "profile"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "finalize",
      "docs": [
        "Commits the final match and book state to Solana and schedules the MatchRecord receipt",
        "as a post-commit Magic Action. `finalized` counts attempts."
      ],
      "discriminator": [
        171,
        61,
        218,
        56,
        127,
        115,
        12,
        217
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "marketLive",
          "writable": true
        },
        {
          "name": "marketDelayed",
          "writable": true
        },
        {
          "name": "record",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "programId",
          "address": "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalizeModel",
      "docs": [
        "Locks the model, stores the held-out metrics hash and makes it the active version."
      ],
      "discriminator": [
        151,
        118,
        120,
        206,
        93,
        84,
        34,
        223
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "model",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "version"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "version",
          "type": "u16"
        },
        {
          "name": "metricsHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initHouseVault",
      "docs": [
        "Creates the house vault eATA (owned by the Config PDA) and delegates it to `validator`",
        "(first remaining account)."
      ],
      "discriminator": [
        82,
        247,
        65,
        25,
        166,
        239,
        30,
        112
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "houseEata",
          "writable": true
        },
        {
          "name": "eataBuffer",
          "writable": true
        },
        {
          "name": "eataRecord",
          "writable": true
        },
        {
          "name": "eataMetadata",
          "writable": true
        },
        {
          "name": "ephemeralTokenProgram",
          "address": "SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initPositionPermission",
      "docs": [
        "Makes a Position private: only its owner (and the house authority) can read it."
      ],
      "discriminator": [
        178,
        252,
        66,
        17,
        222,
        148,
        4,
        126
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "position.market",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  109,
                  105,
                  115,
                  115,
                  105,
                  111,
                  110,
                  58
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                136,
                161,
                10,
                196,
                33,
                152,
                1,
                214,
                246,
                106,
                29,
                60,
                6,
                152,
                192,
                102,
                169,
                175,
                212,
                217,
                180,
                252,
                231,
                71,
                151,
                141,
                209,
                5,
                168,
                212,
                103,
                82
              ]
            }
          }
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "configArgs"
            }
          }
        }
      ]
    },
    {
      "name": "joinFight",
      "docs": [
        "A fighter joins: stake moves from the player's token account to the match escrow.",
        "The second join starts the match."
      ],
      "discriminator": [
        47,
        87,
        196,
        10,
        242,
        34,
        242,
        160
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "player"
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "playerToken",
          "writable": true
        },
        {
          "name": "escrowToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "joinPosition",
      "docs": [
        "Creates a spectator Position for one book, pre-funded for its ephemeral permission."
      ],
      "discriminator": [
        193,
        119,
        7,
        191,
        161,
        170,
        154,
        123
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "market"
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "pause",
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "relayDelayedState",
      "docs": [
        "TV-delay baseline: the relay posts features that are `delay_ms` old into the Delayed",
        "book. Same pricing code as `tick`, different (late) feed."
      ],
      "discriminator": [
        176,
        164,
        71,
        137,
        174,
        52,
        160,
        178
      ],
      "accounts": [
        {
          "name": "relay",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "model",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "config.model_version",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "marketDelayed",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        },
        {
          "name": "tick",
          "type": "u64"
        },
        {
          "name": "features",
          "type": {
            "array": [
              "i64",
              16
            ]
          }
        },
        {
          "name": "timeLeftMs",
          "type": "u32"
        },
        {
          "name": "lethal",
          "type": "bool"
        }
      ]
    },
    {
      "name": "requestWaveRandomness",
      "docs": [
        "Requests the VRF seed for the next power-up wave (one request per wave, never per tick)."
      ],
      "discriminator": [
        161,
        1,
        61,
        241,
        98,
        154,
        193,
        5
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "revealPositions",
      "docs": [
        "Reveals more positions after settle, in batches of (position, permission) pairs."
      ],
      "discriminator": [
        108,
        131,
        124,
        93,
        225,
        232,
        17,
        44
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "scheduleTick",
      "docs": [
        "Schedules the match crank on the ER: each iteration runs `tick` then `settle` (a no-op",
        "until the fight ends). The task id is derived from hash(program_id ‖ match_id) and the",
        "scheduled instructions carry no signer accounts."
      ],
      "discriminator": [
        197,
        80,
        214,
        198,
        209,
        150,
        211,
        44
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "program",
          "address": "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej"
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "model",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "config.model_version",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "marketLive",
          "writable": true
        },
        {
          "name": "marketDelayed",
          "writable": true
        },
        {
          "name": "escrowToken",
          "writable": true
        },
        {
          "name": "fighterAToken",
          "writable": true
        },
        {
          "name": "fighterBToken",
          "writable": true
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "profileA",
          "writable": true
        },
        {
          "name": "profileB",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        },
        {
          "name": "intervalMs",
          "type": "i64"
        },
        {
          "name": "iterations",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setModelParams",
      "docs": [
        "Chunked write of the 4,744-byte model blob (fits the 1,232-byte transaction limit)."
      ],
      "discriminator": [
        128,
        182,
        141,
        249,
        102,
        168,
        184,
        68
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "model",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "version"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "version",
          "type": "u16"
        },
        {
          "name": "offset",
          "type": "u32"
        },
        {
          "name": "chunk",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "setSpreadParams",
      "discriminator": [
        237,
        54,
        184,
        9,
        128,
        57,
        0,
        167
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "spreadArgs"
            }
          }
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Pays the fighters from escrow, closes both books and reveals any positions passed as",
        "(position, permission) pairs in the remaining accounts. Permissionless and idempotent;",
        "a no-op while the fight is still running (so the crank can call it every tick)."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "marketLive",
          "writable": true
        },
        {
          "name": "marketDelayed",
          "writable": true
        },
        {
          "name": "escrowToken",
          "writable": true
        },
        {
          "name": "fighterAToken",
          "writable": true
        },
        {
          "name": "fighterBToken",
          "writable": true
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "profileA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "fighter_a_token.owner",
                "account": "tokenAccount"
              }
            ]
          }
        },
        {
          "name": "profileB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "fighter_b_token.owner",
                "account": "tokenAccount"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "submitInput",
      "docs": [
        "A fighter's latest input. Monotonic sequence, at most one per tick."
      ],
      "discriminator": [
        56,
        184,
        154,
        91,
        173,
        63,
        21,
        138
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "player"
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        },
        {
          "name": "seq",
          "type": "u64"
        },
        {
          "name": "inputBits",
          "type": "u16"
        }
      ]
    },
    {
      "name": "tick",
      "docs": [
        "Advances the duel by one fixed step and re-prices the Ringside book in the same",
        "instruction. Permissionless (crank-scheduled), time-gated and idempotent."
      ],
      "discriminator": [
        92,
        79,
        44,
        8,
        101,
        80,
        63,
        15
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "model",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "config.model_version",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "marketLive",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "topupHouseVault",
      "docs": [
        "Admin moves house liquidity into the house vault on the ER."
      ],
      "discriminator": [
        47,
        144,
        88,
        112,
        222,
        135,
        167,
        22
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "adminToken",
          "writable": true
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "trade",
      "docs": [
        "Spectator trade against the house. Rejects stale ticks and fighters onchain.",
        "With `record_rejects`, a stale/fighter/frozen rejection is counted onchain and the",
        "transaction succeeds without a fill; otherwise it fails with the error."
      ],
      "discriminator": [
        178,
        144,
        26,
        216,
        241,
        187,
        206,
        130
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "trader"
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "traderToken",
          "writable": true
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        },
        {
          "name": "seenTick",
          "type": "u64"
        },
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "tradeSide"
            }
          }
        },
        {
          "name": "dir",
          "type": {
            "defined": {
              "name": "tradeDir"
            }
          }
        },
        {
          "name": "qty",
          "type": "u64"
        },
        {
          "name": "limitPrice",
          "type": "u64"
        },
        {
          "name": "recordRejects",
          "type": "bool"
        }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "configArgs"
            }
          }
        }
      ]
    },
    {
      "name": "vrfCallback",
      "docs": [
        "VRF fulfilment: writes the wave seed into the sim state. Bound to the pending request",
        "and idempotent."
      ],
      "discriminator": [
        248,
        224,
        55,
        227,
        56,
        10,
        108,
        36
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "signer": true,
          "address": "C7CxFhNv4KMVB17W6nkzwzM2zg43ojLu4Mv3o5Za6Yum"
        },
        {
          "name": "game",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "wave",
          "type": "u16"
        }
      ]
    },
    {
      "name": "withdrawFees",
      "docs": [
        "Admin withdraws a match's accrued fighter fees from the house vault."
      ],
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "marketLive",
          "writable": true
        },
        {
          "name": "adminToken",
          "writable": true
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "writeMatchRecord",
      "docs": [
        "Base-layer handler for the finalize Magic Action: writes the MatchRecord receipt.",
        "Only reachable through the post-commit path (escrow signer) scheduled by this program."
      ],
      "discriminator": [
        173,
        102,
        210,
        122,
        65,
        104,
        220,
        187
      ],
      "accounts": [
        {
          "name": "record",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "args.match_id"
              }
            ]
          }
        },
        {
          "name": "sourceProgram",
          "address": "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej"
        },
        {
          "name": "escrowAuth"
        },
        {
          "name": "escrow",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "recordArgs"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "match",
      "discriminator": [
        236,
        63,
        169,
        38,
        15,
        56,
        196,
        162
      ]
    },
    {
      "name": "matchRecord",
      "discriminator": [
        114,
        83,
        48,
        236,
        239,
        237,
        21,
        85
      ]
    },
    {
      "name": "modelParams",
      "discriminator": [
        196,
        132,
        123,
        166,
        70,
        124,
        140,
        178
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "profile",
      "discriminator": [
        184,
        101,
        165,
        188,
        95,
        63,
        127,
        188
      ]
    }
  ],
  "events": [
    {
      "name": "rejectEvent",
      "discriminator": [
        192,
        82,
        231,
        32,
        161,
        225,
        157,
        75
      ]
    },
    {
      "name": "seedEvent",
      "discriminator": [
        42,
        198,
        238,
        64,
        226,
        147,
        253,
        82
      ]
    },
    {
      "name": "settleEvent",
      "discriminator": [
        14,
        166,
        206,
        248,
        35,
        1,
        134,
        48
      ]
    },
    {
      "name": "tickEvent",
      "discriminator": [
        180,
        6,
        239,
        72,
        112,
        13,
        39,
        219
      ]
    },
    {
      "name": "tradeEvent",
      "discriminator": [
        189,
        219,
        127,
        211,
        78,
        230,
        97,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "errStaleTick",
      "msg": "Fill priced off a stale tick"
    },
    {
      "code": 6001,
      "name": "errFighterBarred",
      "msg": "Fighters and their session keys cannot trade their own match"
    },
    {
      "code": 6002,
      "name": "errSlippage",
      "msg": "Price is worse than the limit"
    },
    {
      "code": 6003,
      "name": "errExposure",
      "msg": "House exposure cap would be exceeded"
    },
    {
      "code": 6004,
      "name": "errClosed",
      "msg": "Market or match is not open"
    },
    {
      "code": 6005,
      "name": "errNotFighter",
      "msg": "Signer is not a fighter in this match"
    },
    {
      "code": 6006,
      "name": "errBadSeq",
      "msg": "Input sequence must increase and inputs are limited to one per tick"
    },
    {
      "code": 6007,
      "name": "errTooEarly",
      "msg": "Too early: time gate not reached"
    },
    {
      "code": 6008,
      "name": "errBadQueue",
      "msg": "Wrong VRF queue or request"
    },
    {
      "code": 6009,
      "name": "errPaused",
      "msg": "paused"
    },
    {
      "code": 6010,
      "name": "errMath",
      "msg": "Arithmetic error"
    },
    {
      "code": 6011,
      "name": "errAlreadySettled",
      "msg": "Already settled"
    },
    {
      "code": 6012,
      "name": "errFrozen",
      "msg": "Quotes are frozen after a lethal-range hit"
    },
    {
      "code": 6013,
      "name": "errInsufficientShares",
      "msg": "Not enough shares to sell"
    },
    {
      "code": 6014,
      "name": "errBadQty",
      "msg": "Quantity is zero or above the per-trade maximum"
    },
    {
      "code": 6015,
      "name": "errUnauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6016,
      "name": "errInvalidAccount",
      "msg": "Invalid account"
    },
    {
      "code": 6017,
      "name": "errMatchFull",
      "msg": "Match is full or the opponent is reserved"
    },
    {
      "code": 6018,
      "name": "errModel",
      "msg": "Model is not finalized or has a bad layout"
    },
    {
      "code": 6019,
      "name": "errNotSettled",
      "msg": "Not settled yet"
    },
    {
      "code": 6020,
      "name": "errWrongMode",
      "msg": "Wrong market mode for this instruction"
    }
  ],
  "types": [
    {
      "name": "config",
      "docs": [
        "Global configuration (base layer, read on the ER)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "relayAuthority",
            "type": "pubkey"
          },
          {
            "name": "houseVault",
            "docs": [
              "House vault token account (ATA of this Config PDA), delegated as an eATA."
            ],
            "type": "pubkey"
          },
          {
            "name": "exposureCapPerMatch",
            "type": "u64"
          },
          {
            "name": "maxQty",
            "type": "u64"
          },
          {
            "name": "sBase",
            "type": "u64"
          },
          {
            "name": "sVolBps",
            "type": "u64"
          },
          {
            "name": "sTime",
            "type": "u64"
          },
          {
            "name": "kSkew",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "tickMs",
            "type": "u16"
          },
          {
            "name": "modelVersion",
            "type": "u16"
          },
          {
            "name": "staleTicksMax",
            "type": "u8"
          },
          {
            "name": "minSlotGap",
            "docs": [
              "Minimum ER slots between ticks (time gate, with the wall-clock bound in `tick`)."
            ],
            "type": "u8"
          },
          {
            "name": "freezeTicks",
            "docs": [
              "Quotes stay frozen for this many ticks after a lethal-range hit."
            ],
            "type": "u8"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "tickMs",
            "type": "u16"
          },
          {
            "name": "staleTicksMax",
            "type": "u8"
          },
          {
            "name": "minSlotGap",
            "type": "u8"
          },
          {
            "name": "freezeTicks",
            "type": "u8"
          },
          {
            "name": "relayAuthority",
            "type": "pubkey"
          },
          {
            "name": "spread",
            "type": {
              "defined": {
                "name": "spreadArgs"
              }
            }
          }
        ]
      }
    },
    {
      "name": "market",
      "docs": [
        "One order book for one match."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchKey",
            "type": "pubkey"
          },
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "fairP",
            "type": "i64"
          },
          {
            "name": "lastPricedTick",
            "type": "u64"
          },
          {
            "name": "mid",
            "type": "u64"
          },
          {
            "name": "bidA",
            "type": "u64"
          },
          {
            "name": "askA",
            "type": "u64"
          },
          {
            "name": "bidB",
            "type": "u64"
          },
          {
            "name": "askB",
            "type": "u64"
          },
          {
            "name": "spread",
            "type": "u64"
          },
          {
            "name": "invA",
            "type": "u64"
          },
          {
            "name": "invB",
            "type": "u64"
          },
          {
            "name": "houseCash",
            "type": "i64"
          },
          {
            "name": "houseLiabilityA",
            "type": "u64"
          },
          {
            "name": "houseLiabilityB",
            "type": "u64"
          },
          {
            "name": "maxExposureSeen",
            "type": "u64"
          },
          {
            "name": "cap",
            "type": "u64"
          },
          {
            "name": "volume",
            "type": "u64"
          },
          {
            "name": "nTrades",
            "type": "u64"
          },
          {
            "name": "nRejectedStale",
            "type": "u64"
          },
          {
            "name": "nRejectedFighter",
            "type": "u64"
          },
          {
            "name": "nRejectedOther",
            "type": "u64"
          },
          {
            "name": "feeAccrued",
            "type": "u64"
          },
          {
            "name": "frozenUntilTick",
            "type": "u64"
          },
          {
            "name": "claimedTotal",
            "type": "u64"
          },
          {
            "name": "relayUnixMs",
            "type": "i64"
          },
          {
            "name": "nPositions",
            "type": "u32"
          },
          {
            "name": "delayMs",
            "type": "u32"
          },
          {
            "name": "pHist",
            "docs": [
              "Mid history, ring buffer of the last 11 priced ticks (micro-USDC)."
            ],
            "type": {
              "array": [
                "u32",
                11
              ]
            }
          },
          {
            "name": "pHistHead",
            "type": "u8"
          },
          {
            "name": "mode",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "winner",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "match",
      "docs": [
        "One duel. Delegated to the TEE validator; public."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "createdUnix",
            "type": "i64"
          },
          {
            "name": "startUnix",
            "type": "i64"
          },
          {
            "name": "startSlot",
            "type": "u64"
          },
          {
            "name": "lastTickSlot",
            "type": "u64"
          },
          {
            "name": "lastTickUnixMs",
            "docs": [
              "Wall-clock estimate of the last tick (ER unix seconds × 1000); informational."
            ],
            "type": "i64"
          },
          {
            "name": "endUnix",
            "type": "i64"
          },
          {
            "name": "inputSeq",
            "type": {
              "array": [
                "u64",
                2
              ]
            }
          },
          {
            "name": "fighters",
            "type": {
              "array": [
                "pubkey",
                2
              ]
            }
          },
          {
            "name": "fighterSessionSigners",
            "type": {
              "array": [
                "pubkey",
                2
              ]
            }
          },
          {
            "name": "opponent",
            "docs": [
              "Invited opponent (default = open challenge)."
            ],
            "type": "pubkey"
          },
          {
            "name": "marketLive",
            "type": "pubkey"
          },
          {
            "name": "marketDelayed",
            "type": "pubkey"
          },
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "stateHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "inputTick",
            "type": {
              "array": [
                "u32",
                2
              ]
            }
          },
          {
            "name": "inputs",
            "type": {
              "array": [
                "u16",
                2
              ]
            }
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "winner",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "joined",
            "type": "u8"
          },
          {
            "name": "vrfRequestedWave",
            "type": "u16"
          },
          {
            "name": "vrfFulfilledWave",
            "type": "u16"
          },
          {
            "name": "nVrf",
            "type": "u16"
          },
          {
            "name": "finalized",
            "type": "u8"
          },
          {
            "name": "aiFlags",
            "type": "u8"
          },
          {
            "name": "sim",
            "type": {
              "array": [
                "u8",
                832
              ]
            }
          }
        ]
      }
    },
    {
      "name": "matchRecord",
      "docs": [
        "Settlement receipt on the base layer, written by a Magic Action after the final commit."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchKey",
            "type": "pubkey"
          },
          {
            "name": "finalHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "ticks",
            "type": "u64"
          },
          {
            "name": "volumeLive",
            "type": "u64"
          },
          {
            "name": "volumeDelayed",
            "type": "u64"
          },
          {
            "name": "housePnlLive",
            "type": "i64"
          },
          {
            "name": "housePnlDelayed",
            "type": "i64"
          },
          {
            "name": "startUnix",
            "type": "i64"
          },
          {
            "name": "endUnix",
            "type": "i64"
          },
          {
            "name": "recordedUnix",
            "type": "i64"
          },
          {
            "name": "winner",
            "type": "u8"
          },
          {
            "name": "written",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "modelParams",
      "docs": [
        "Win-probability model parameters: header + the serialized integer model."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "metricsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "written",
            "type": "u32"
          },
          {
            "name": "version",
            "type": "u16"
          },
          {
            "name": "finalized",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "blob",
            "type": {
              "array": [
                "u8",
                4744
              ]
            }
          }
        ]
      }
    },
    {
      "name": "position",
      "docs": [
        "A spectator's position in one market. Private (PER permission) until reveal."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "sharesA",
            "type": "u64"
          },
          {
            "name": "sharesB",
            "type": "u64"
          },
          {
            "name": "costBasis",
            "type": "i64"
          },
          {
            "name": "realized",
            "type": "i64"
          },
          {
            "name": "lastFillTick",
            "type": "u64"
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "revealed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "profile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "totalStaked",
            "type": "u64"
          },
          {
            "name": "elo",
            "type": "u32"
          },
          {
            "name": "matches",
            "type": "u32"
          },
          {
            "name": "wins",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "recordArgs",
      "docs": [
        "Arguments the finalize action writes into the record."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "finalHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ticks",
            "type": "u64"
          },
          {
            "name": "volumeLive",
            "type": "u64"
          },
          {
            "name": "volumeDelayed",
            "type": "u64"
          },
          {
            "name": "housePnlLive",
            "type": "i64"
          },
          {
            "name": "housePnlDelayed",
            "type": "i64"
          },
          {
            "name": "startUnix",
            "type": "i64"
          },
          {
            "name": "endUnix",
            "type": "i64"
          },
          {
            "name": "winner",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "rejectEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "tick",
            "type": "u64"
          },
          {
            "name": "seenTick",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": "u32"
          },
          {
            "name": "mode",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "seedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchKey",
            "type": "pubkey"
          },
          {
            "name": "wave",
            "type": "u16"
          },
          {
            "name": "applyAtTick",
            "type": "u32"
          },
          {
            "name": "seed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sessionTokenV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "targetProgram",
            "type": "pubkey"
          },
          {
            "name": "sessionSigner",
            "type": "pubkey"
          },
          {
            "name": "feePayer",
            "type": "pubkey"
          },
          {
            "name": "validUntil",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "settleEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchKey",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "u8"
          },
          {
            "name": "ticks",
            "type": "u64"
          },
          {
            "name": "finalHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "spreadArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sBase",
            "type": "u64"
          },
          {
            "name": "sVolBps",
            "type": "u64"
          },
          {
            "name": "sTime",
            "type": "u64"
          },
          {
            "name": "kSkew",
            "type": "u64"
          },
          {
            "name": "exposureCapPerMatch",
            "type": "u64"
          },
          {
            "name": "maxQty",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tickEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchKey",
            "type": "pubkey"
          },
          {
            "name": "tick",
            "type": "u64"
          },
          {
            "name": "inputs",
            "type": {
              "array": [
                "u16",
                2
              ]
            }
          },
          {
            "name": "flags",
            "type": "u32"
          },
          {
            "name": "fairP",
            "type": "i64"
          },
          {
            "name": "stateHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "tradeDir",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          }
        ]
      }
    },
    {
      "name": "tradeEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "tick",
            "docs": [
              "Tick the book was priced on (for the TV-delay book: the relayed, late tick)."
            ],
            "type": "u64"
          },
          {
            "name": "gameTick",
            "docs": [
              "The fight's actual tick when the fill executed."
            ],
            "type": "u64"
          },
          {
            "name": "seenTick",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "dir",
            "type": "u8"
          },
          {
            "name": "mode",
            "type": "u8"
          },
          {
            "name": "unixMs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tradeSide",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "a"
          },
          {
            "name": "b"
          }
        ]
      }
    }
  ]
};
