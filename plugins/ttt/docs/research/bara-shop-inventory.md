# Bara shop source inventory

Source-only inventory at aa9699cbc403023a4947e6d60a263cb3f95919b7. No CS2 behavior or parity is validated here. Prices are upstream SourcePawn defaults. Static registration calls include conditional branches and role variants, not unique items.

| Source module | Static registrations | Price defaults |
| --- | ---: | --- |
| [ttt_blackout.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_blackout.sp#L107) | 1 | `blackout_price=9000` |
| [ttt_bullets.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_bullets.sp#L142) | 3 | `bullets_ice_price=5000`, `bullets_fire_price=5000`, `bullets_poison_price=5000` |
| [ttt_buyRoles.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_buyRoles.sp#L96) | 4 | `buyroles_traitor_price=9000`, `buyroles_traitor_instantly_price=40000`, `buyroles_detective_price=9000`, `buyroles_detective_instantly_price=10000` |
| [ttt_c4_jihad.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_c4_jihad.sp#L222) | 2 | `c4_price=9000`, `jihad_price=9000` |
| [ttt_clothes.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_clothes.sp#L78) | 1 | `clothes_price=9000` |
| [ttt_decoy_body.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_decoy_body.sp#L132) | 1 | `decoy_body_price=9000` |
| [ttt_decoy_teleport.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_decoy_teleport.sp#L91) | 2 | `dt_traitor_price=9000`, `dt_detective_price=9000` |
| [ttt_dnascanner.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_dnascanner.sp#L93) | 1 | `dna_price=9000` |
| [ttt_dronescameras.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_dronescameras.sp#L97) | 2 | `cad_camera_price=9000`, `cad_drone_price=9000` |
| [ttt_dropWeapons.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_dropWeapons.sp#L119) | 1 | `drop_price=9000` |
| [ttt_exojump.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_exojump.sp#L67) | 1 | `exojump_price=3000` |
| [ttt_fakebody.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_fakebody.sp#L96) | 1 | `fakebody_price=9000` |
| [ttt_fakename.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_fakename.sp#L120) | 2 | `fakename_price=5000`, `invisible_name_price=5000` |
| [ttt_futuristicgrenades.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_futuristicgrenades.sp#L263) | 15 | `futuristic_price_innocent=20000`, `futuristic_price_traitor=20000`, `futuristic_price_detective=20000`, `forcefield_price_innocent=8000`, `forcefield_price_traitor=8000`, `forcefield_price_detective=8000`, `blackhole_price_innocent=8000`, `blackhole_price_traitor=8000`, `blackhole_price_detective=8000`, `explosion_price_innocent=8000`, `explosion_price_traitor=8000`, `explosion_price_detective=8000`, `implosion_price_innocent=8000`, `implosion_price_traitor=8000`, `implosion_price_detective=8000` |
| [ttt_healthshot.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_healthshot.sp#L89) | 3 | `healthshot_traitor_price=9000`, `healthshot_detective_price=9000`, `healthshot_innocent_price=9000` |
| [ttt_hurtshot.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_hurtshot.sp#L232) | 1 | `hurtshot_traitor_price=5000` |
| [ttt_iceknife.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_iceknife.sp#L213) | 1 | `iceknife_price=9000` |
| [ttt_id.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_id.sp#L170) | 2 | `id_traitor_price=1000`, `id_innocent_price=1000` |
| [ttt_ioncannon.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_ioncannon.sp#L295) | 2 | `ion_cannon_def_price=18750`, `ion_cannon_auto_price=38750` |
| [ttt_knockout.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_knockout.sp#L174) | 1 | `knockout_price=9000` |
| [ttt_martydom.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_martydom.sp#L105) | 3 | `martydom_price_innocent=2000`, `martydom_price_traitor=2000`, `martydom_price_detective=2000` |
| [ttt_missiles.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_missiles.sp#L229) | 9 | `missiles_price_t=7500`, `missiles_price_d=0`, `missiles_price_i=0`, `missiles_following_price_i=0`, `missiles_following_price_t=10000`, `missiles_following_price_d=0`, `missiles_control_price_i=0`, `missiles_control_price_t=10000`, `missiles_control_price_d=0` |
| [ttt_nightvision.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_nightvision.sp#L87) | 1 | `nightvision_price=3000` |
| [ttt_parachute.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_parachute.sp#L80) | 1 | `parachute_price=3000` |
| [ttt_poison_smoke.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_poison_smoke.sp#L89) | 1 | `posion_smoke_price=9000` |
| [ttt_radar.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_radar.sp#L119) | 2 | `radar_price=9000`, `radar_price_traitor=9000` |
| [ttt_random_teleport.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_random_teleport.sp#L114) | 3 | `rt_traitor_price=9000`, `rt_detective_price=0`, `rt_innocent_price=0` |
| [ttt_respawn.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_respawn.sp#L88) | 1 | `respawn_traitor_price=9000` |
| [ttt_revive.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_revive.sp#L140) | 2 | `revive_traitor_price=9000`, `revive_detective_price=0` |
| [ttt_revolver.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_revolver.sp#L86) | 1 | `revolver_detective_price=6000` |
| [ttt_shield.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_shield.sp#L107) | 3 | `shield_traitor_price=9000`, `shield_detective_price=9000`, `shield_innocent_price=9000` |
| [ttt_silent_awp.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_silent_awp.sp#L113) | 3 | `silent_awp_price_t=10000`, `silent_awp_price_d=0`, `silent_awp_price_i=0` |
| [ttt_sprint.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_sprint.sp#L114) | 3 | `sprint_price_detective=9000`, `sprint_price_innocent=9000`, `sprint_price_traitor=9000` |
| [ttt_stations.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_stations.sp#L154) | 2 | `health_station_price=3000`, `hurt_station_price=0` |
| [ttt_tactical_shield.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_tactical_shield.sp#L87) | 1 | `tactical_shield_price=9000` |
| [ttt_tagrenade.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_tagrenade.sp#L152) | 2 | `tagrenade_traitor_price=9000`, `tagrenade_detective_price=9000` |
| [ttt_taser.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_taser.sp#L187) | 3 | `taser_detective_price=9000`, `taser_innocent_price=9000`, `taser_traitor_price=0` |
| [ttt_teleporter.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_teleporter.sp#L97) | 1 | `teleporter_price=9000` |
| [ttt_tracer.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_tracer.sp#L95) | 2 | `jammer_price=9000`, `tracer_price=9000` |
| [ttt_tripmines.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_tripmines.sp#L158) | 1 | `tripmines_price=9000` |
| [ttt_turret.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_turret.sp#L89) | 1 | `turret_price=9000` |
| [ttt_wallhack.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_wallhack.sp#L146) | 2 | `wallhack_traitor_price=9000`, `wallhack_detective_price=0` |
| [ttt_weapons.sp](https://github.com/TroubleInTerroristTown/Public/blob/aa9699cbc403023a4947e6d60a263cb3f95919b7/addons/sourcemod/scripting/ttt/ttt_weapons.sp#L362) | 42 | `kevlar_price=3000`, `heavy_price=10000`, `helm_price=2000`, `kevhelm_price=2000`, `usp_price=3000`, `mp5sd_price=3000`, `ak47_price=3000`, `deagle_price=3000`, `revolver_price=3000`, `scout_price=3000`, `m4a1_price=3000`, `awp_price=3000`, `breathcharge_price=3000`, `bumpmine_price=3000`, `oneknife_price=3000`, `hammer_price=3000`, `axe_price=3000`, `spanner_price=3000` |

68 top-level SP files; 137 static registrations across 43 modules.

## External gameplay providers

These wrappers delegate gameplay to external SourceMod plugins. Inspect providers separately before claiming parity:

- Cameras and Drones: includes camerasanddrones, calls BuyPlayerGear/OverridePlayerGear and gives tag grenade. README links https://forums.alliedmods.net/showthread.php?p=2537127.
- Futuristic Grenades: includes futuristicgrenades and switches decoy modes (forcefield, black hole, explosion, implosion). README links https://forums.alliedmods.net/showthread.php?p=2499362.
- Tactical Shield: includes tacticalshield, calls GivePlayerShield/SetEquipPlayerShield. README links https://forums.alliedmods.net/showthread.php?t=303333.
- Advanced Parachute: includes AdvancedParachute; inventory entitlement gates OnParachuteOpen. README links https://forums.alliedmods.net/showthread.php?p=2534158.
- Turret integration includes turret_core. Provider needs inspection.

## Mapping defects to review

- ttt_missiles.sp:229-241 registers _i IDs for detective and _d for innocent, combines different count variables.
- ttt_silent_awp.sp:113-115 has analogous _i/_d ID mismatches.
- ttt_sprint.sp:114-116 uses traitor price for detective and detective price for traitor.
- ttt_weapons.sp:416 reuses HELM_ITEM_SHORT in kevlar+helmet branch. Review conditional context.

## Selected defaults

- Health station detective price3000,10 charges,heal15,maxHP125,radius200,1s interval,activation-on-purchase. Hurt station traitor price0 (disabled),15 charges,damage25,2s interval,other-traitor damage disabled (ttt_stations.sp:83-103).
- DNA scanner detective price9000; free spawn enabled3 uses; bought count6; one-buy unlimited flag1. Read usage paths instead of relying on contradictory cvar labels (ttt_dnascanner.sp:49-57).
- Revive traitor price9000/detective0,10s process,50hp,10s acceptance,LOS required,movement cancellation disabled (ttt_revive.sp:80-95).
- Bara tripmine traitor registration despite price-description saying detective. Price9000,1 mine,command placement,1s cooldown,red beam,radius256,damage550; owner/fellow-traitor protection default enabled (ttt_tripmines.sp:67-80,158). Distinct from CSS Tripwire.
- Cluster is a requested CSS enhancement, not a Bara item here.

## Remaining investigation

Read each item effect/lifecycle/disposal path before translating it. Registration extraction is not behavior coverage. Danger Zone weapons/assets and other CS2 equivalents require explicit supported counterparts and documented exceptions. CSS and Bara credit scales differ greatly; normalize enhancement prices deliberately after deciding the economy baseline.

