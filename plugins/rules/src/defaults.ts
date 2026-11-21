/**
 * The rules this plugin writes to configs/rules.json the first time it runs: the EdgeGamers TTT
 * server rules (forum post, updated 28 November 2021), as text only. Operators edit the file, not this.
 */
import type { RulesFile } from './rules';

export const DEFAULT_RULES: RulesFile = {
  title: '{red}TTT Rules',
  sections: [
    {
      id: 'howto', label: 'How to Play', group: 'Start here',
      paragraphs: [
        'Each round, three roles are handed out at random: Innocent, Detective and Traitor. Follow your assigned role, and have fun!',
        'Innocents are suspected as Traitors until they prove themselves to other Innocents and Detectives. Survive, and use the process of elimination to find the Traitors and kill them.',
        'Detectives are proven Innocents with special equipment for finding the Traitors. They are a great asset to the process of elimination, which makes them a high-profile target.',
        'Traitors look like Innocents to everyone except other Traitors. Use surprise, deception and your special equipment to eliminate the Innocents and Detectives without getting caught.',
      ],
    },
    {
      id: 'commands', label: 'Commands', group: 'Start here',
      rules: [
        'F toggles your flashlight.',
        'E identifies bodies.',
        'Team chat (U) talks to your fellow Traitors.',
        '!menu or !shop opens the shop.',
        '!specmenu or !spm opens the spectator menu.',
        '!credits shows your credits.',
        '!logs shows the round logs.',
        'Type @ before a message in any chat (Y or U) to reach an admin. Use it only for reports on players, concerns, or questions about the game.',
        '!servers joins another eGO server directly.',
        '!rules opens these rules.',
        '!mhud and !rtd.',
      ],
    },
    {
      id: 'admins', label: 'Admins', group: 'Start here',
      paragraphs: [
        'All TTT rules are enforced by our admins at their discretion. If you have a problem or a concern with how a situation is handled, or need a rule clarified, contact a member of CS Leadership or use the Contact Leadership section on the forums.',
        'Our rules are designed to create and maintain fun and fair game play. Rules may be changed by CS Leadership at their discretion: TTT is dynamic and sometimes quick changes need to be made. This is a guide, so use common sense when interpreting it.',
      ],
    },
    {
      id: 'general', label: 'General', group: 'Rules',
      rules: [
        'Do not Random Death Match (RDM). You need sufficient evidence (see Traitorous) proving that a player is a Traitor to kill them.',
        'Do not ghost: giving out any information about the game to alive players by any means of communication.',
        'Do not prop kill (tripmines, map doors or breakable surfaces, map props such as TNT blocks on Minecraft maps).',
        'Do not door spam.',
        'Do not prop surf or glitch on any map.',
        'Do not kill players based on sound, location or weapon. You must have DEFINITIVE proof to kill a player.',
        'Do not kill rule-breakers or seek revenge. Only shoot in self-defense, and not for reasons from previous rounds.',
        'Do not use an in-game name that cannot be pronounced or typed.',
        'Do not complain. Report rule violations in admin chat (type @ in team chat followed by your message).',
        'Do not kill players just for shooting their weapon.',
        'Do not kill players for not responding to an alive check.',
      ],
    },
    {
      id: 'detective', label: '{darkblue}Detective', group: 'Rules',
      rules: [
        'Must actively pursue the round, and may not camp or delay.',
        'May not present a player as a Traitor without a valid reason (see Traitorous).',
        'May not kill a player for disobeying orders.',
        'Needs 1 DNA scan on a dead Innocent or Detective body before calling a Kill on Sight (KOS) on a player.',
        'May call KOS on players seen committing a traitorous act (running over unidentified bodies situationally, buying a Traitor weapon in their sight, placing a death station in their sight, etc.).',
      ],
    },
    {
      id: 'innocent', label: '{green}Innocent', group: 'Rules',
      rules: [
        'Must actively pursue the round, and may not camp or delay.',
        'May not present a player as a Traitor without a valid reason.',
        'May not Traitor bait: making it look like you are a Traitor when you are actually an Innocent.',
      ],
    },
    {
      id: 'traitor', label: '{red}Traitor', group: 'Rules',
      rules: [
        'Must actively attempt to complete the objective, and may not camp or delay.',
        'May not kill or damage other Traitors unless acting in self-defense (includes using map objects).',
      ],
    },
    {
      id: 'nonsuspicious', label: 'Not Suspicious', group: 'Behavior',
      heading: 'Non-suspicious behavior: do NOT kill for these',
      rules: [
        'Being injured.',
        'Walking into someone\'s line of fire.',
        'Activating non-Traitor traps when no other players are at risk (this includes secret rooms on certain maps).',
        'Self-defense: attacking a player who intentionally attacked you first (except line of fire) without valid reason.',
        'Refusing to respond to live checks, ammo checks, slot checks, etc.',
        'Door spamming (this is griefing and should be reported to admins).',
        'Walking as though they have a menu open, not moving, or AFK.',
        'Being one of many people with the weapon used to kill someone, or not being near their death.',
      ],
    },
    {
      id: 'suspicious', label: 'Suspicious', group: 'Behavior',
      heading: 'Suspicious behavior: do NOT kill for these without more valid evidence',
      rules: [
        'Excessively aiming at, watching and stalking players (all three combined are a single act).',
        'Not co-operating with Detectives or being tested.',
        'Not responding in a reasonable time when confronted with an accusation.',
        'Being equipped with any Traitor-only weapon.',
        'Being the only one with the weapon used to kill or injure someone nearby their death.',
        'Being called out for kill-on-sight (KOS) by an Innocent.',
        'Calling a KOS on someone who did not damage you first and is an Innocent.',
        'Being the survivor of a gunfight, or near a body. Be alert, not mindless: identify the body and communicate.',
        'Being poisoned by the Poison Gun while in a secluded area with few players around.',
        'Not receiving radiation damage from the Poison Gun.',
        'Shooting through walls, doors, fences, windows, etc. (anywhere you cannot tell who is on the other side; see the FAQ).',
      ],
    },
    {
      id: 'traitorous', label: '{red}Traitorous', group: 'Behavior',
      heading: 'Traitorous behavior: you MUST kill for these',
      kicker: 'Failing to do so can itself be considered traitorous.',
      rules: [
        'Entering or leaving a Traitor-only area.',
        'Being called out for kill-on-sight (KOS) by a Detective.',
        'Shooting around or towards other players, unless in self-defense or with prior justification (e.g. KOSes).',
        'Throwing lethal grenades towards other players without prior warning, unless in self-defense. Flashes and smokes are NOT traitorous.',
        'Declaring a KOS on an Innocent.',
        'Calling out Traitors without reason, or intentionally making players suspect you are a Traitor.',
        'Purchasing a Traitor-only shop item (tripmines, M4A1-S, MP5, etc.). You must actually see the item being purchased.',
        'Not identifying, hiding or destroying bodies, or hanging them on surfaces.',
        'Activating any trap that almost, or did, kill or injure another player.',
        'Stating they killed a Traitor when they did not (assisting in killing a Traitor counts as killing one).',
        'Destroying or damaging the Traitor Tester or a Health Station (as an Innocent this is griefing). Exception: destroying the Traitor Tester is allowed when you are trapped and your life is in danger, such as C4 planted with no way out but the vents behind it.',
        'Not destroying a Death Station while in range or line of sight of it (not shooting or trying to destroy it, surviving abnormally).',
        'Not moving out of your personal space after being reasonably told at least twice. Give a fair chance and repeat yourself: some may not hear you or react quickly. Personal space is not the room, but being too close for comfort.',
        'Killing or injuring non-traitorous players, the Detective (unless it was line of fire or they attacked first), or a proven player. A proven Innocent is someone you saw kill a Traitor, or tested as Innocent, not proven by word of mouth.',
      ],
    },
    {
      id: 'items', label: 'Item Usage', group: 'Items',
      rules: [
        'DNA Scanner (Detective): !shop, pick DNA Scanner, then press E on bodies. Each scan shows in chat in red with who killed them and with what weapon.',
        'DNA scans: a green or blue body means call KOS on the killer; a red body means call them PROVEN (proven Innocent).',
        'DNA scans: if a green body and a red body were killed by the same player, their role is not definitive. "World" kills mean they were not killed by a player.',
        'Jihad (Traitor): buy it, then press your inspect key twice (default F).',
        'C4 (Traitor): buy it, right click, then pick a time.',
        'Tripmine (Traitor): buy it while facing a surface, otherwise it will not place.',
        'Tripmines: any player can defuse one by holding the interact key (default E), like defusing a bomb in competitive. A tripmine can be shot, but that deals damage and can count as RDM or server disruption.',
        'ID (Innocent): buy it, then type !id to prove yourself Innocent to all alive players in chat.',
        'Teleport (Traitor): buy it where you want your checkpoint, then type !tele to go back to it.',
        'Taser (Innocent and Detective): shooting a player shows their role in chat and highlights them briefly. It does NOT kill, so killing someone for using it is RDM.',
      ],
    },
    {
      id: 'rdm', label: 'RDM', group: 'Definitions',
      heading: 'Random Death Match (RDM)',
      kicker: 'Killing or injuring teammates intentionally or without care is server-punishable.',
      rules: [
        'Throwing grenades at random, or without prior warning for your teammates to move.',
        'Using or setting up any trap without care for teammates.',
        'Assumptions based on how a player moves and talks.',
        'Killing a teammate with a glitch, or any other way, without valid reason.',
        'Innocents killing solely for minor suspicious behavior (careless and not reasonable).',
        'Innocents killing solely for not following requests.',
        'Killing a player for disobeying an order.',
        'Killing a player for pointing a gun at someone.',
      ],
    },
    {
      id: 'tbait', label: 'T-Baiting', group: 'Definitions',
      rules: [
        'Intentionally acting like a Traitor is griefing and server-punishable. Innocents should not commit traitorous acts or claim to be a Traitor.',
        'Example: admitting to being a Traitor in voice or text chat ("I\'m a Traitor", "I\'m a T", "I killed the detective").',
        'Example: shooting or knifing toward or near players only to look like a Traitor.',
      ],
    },
    {
      id: 'misc', label: 'Miscellaneous', group: 'Definitions',
      rules: [
        'Traitor weapons are NOT a reason for a KOS. Some spawn on maps and can be picked up by anyone.',
        'A player who takes no damage from the Poison Gun CANNOT be KOS\'d for it.',
        'A player who is actively taking damage from the Poison Gun CAN be proven Innocent.',
        'Chasing a player with a knife or a taser is NOT a reason for a KOS, and neither is evading a taser.',
        'Admins may take any action they deem necessary to keep the server stable.',
        'CS Leadership and in-game admin decisions are final.',
      ],
    },
    {
      id: 'bounds', label: 'Out of Bounds', group: 'Definitions',
      paragraphs: [
        'Several maps can be exploited by going out of bounds. This is not allowed: any area you cannot reach by normal means is out of bounds.',
        'Exploiting the map does not make a player KOS. Bring it to the admins instead.',
        'Questions? The CS Leadership team answers frequently asked questions about the TTT server in the FAQ on the forums.',
      ],
    },
  ],
};
