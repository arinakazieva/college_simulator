'use strict';

// Event schema:
// {
//   id:          string,
//   title:       string,
//   description: string,
//   condition?:  (state) => boolean              — optional gate
//   choices:     Array<{
//     label:          string,
//     description:    string,
//     effects?:       { statKey: delta, ... },
//     relationships?: { npc: delta, ... },
//     grantItem?:     string,                    — itemId to add
//     removeItem?:    string,                    — itemId to remove
//   }>
// }
//
// To add new events: push an object matching this schema into EVENTS.
// No other files need to change.

const EVENTS = [
  {
    id: 'scholarship',
    title: 'Scholarship Offer',
    description:
      "The department called \u2014 your academic record caught their attention. They're offering a partial scholarship.",
    condition: (state) => state.rating >= 3.5,
    choices: [
      {
        label: 'Accept',
        description: 'Take the money and the recognition.',
        effects: { money: 2500, mood: 6 },
        relationships: { teacher: 4 },
      },
      {
        label: 'Decline',
        description: 'Pass it to someone who needs it more.',
        effects: { mood: 2 },
        relationships: { friend: 2 },
      },
    ],
  },

  {
    id: 'dorm_party',
    title: 'Dorm Party',
    description:
      'Your neighbours are throwing a party. The bass is thumping through the walls and people keep knocking on your door.',
    choices: [
      {
        label: 'Join the Party',
        description: 'Let loose for a night.',
        effects: { mood: 20, energy: -15, knowledge: -5 },
        relationships: { friend: 3 },
      },
      {
        label: 'Study Through It',
        description: 'Focus and push through.',
        effects: { knowledge: 8, mood: -5 },
        relationships: { teacher: 1 },
      },
      {
        label: 'Put On Headphones',
        description: 'A small win.',
        effects: { mood: 5 },
      },
    ],
  },

  {
    id: 'friend_invite',
    title: 'Friend Invites You Out',
    description:
      'Your friend texts: "Come on, let\u2019s grab something to eat. You\u2019ve been buried in books all week."',
    condition: (state) => (state.relationships?.friend || 0) >= 40,
    choices: [
      {
        label: 'Go With Them',
        description: 'Money spent, mood restored.',
        effects: { money: -300, mood: 18, hunger: -25, energy: -5 },
        relationships: { friend: 5 },
      },
      {
        label: 'Decline Politely',
        description: 'Stay focused on your work.',
        effects: { knowledge: 3 },
        relationships: { friend: -3 },
      },
    ],
  },

  {
    id: 'teacher_compliment',
    title: 'Teacher Notices Your Effort',
    description:
      "After class, the professor pulls you aside: \"Your participation has been excellent. Keep it up.\"",
    condition: (state) => state.rating >= 3.3 && (state.relationships?.teacher || 0) >= 30,
    choices: [
      {
        label: 'Thank Them Graciously',
        description: 'A good professional impression.',
        effects: { mood: 8 },
        relationships: { teacher: 5 },
      },
      {
        label: 'Stay Modest',
        description: 'Polite but reserved.',
        effects: { mood: 5 },
        relationships: { teacher: 3 },
      },
    ],
  },

  {
    id: 'overslept',
    title: 'You Overslept',
    description:
      'Your alarm betrayed you. Sunlight is already pouring in and your first class started 20 minutes ago.',
    condition: (state) => state.energy < 50,
    choices: [
      {
        label: 'Rush to Class and Apologize',
        description: "Better late than absent.",
        effects: { energy: -10, mood: -5 },
        relationships: { teacher: -2, headman: -1 },
      },
      {
        label: 'Write It Off and Sleep In',
        description: 'You needed the rest, honestly.',
        effects: { energy: 15, mood: 5 },
        relationships: { teacher: -5, headman: -3 },
      },
    ],
  },

  {
    id: 'unexpected_expense',
    title: 'Unexpected Expense',
    description:
      'Your headphones broke. The decent replacement isn\u2019t cheap, and the cheap ones won\u2019t last a week.',
    choices: [
      {
        label: 'Buy Quality Replacement',
        description: 'Pricey but worth it.',
        effects: { money: -1500, mood: 6 },
      },
      {
        label: 'Cheap Replacement',
        description: 'Better than nothing.',
        effects: { money: -400, mood: -2 },
      },
      {
        label: 'Borrow from Friend',
        description: 'They have a spare set.',
        effects: { mood: 2 },
        relationships: { friend: -2 },
      },
    ],
  },

  {
    id: 'found_notes',
    title: 'Lucky Find',
    description:
      'You stumble across a stack of meticulously organized lecture notes left on a library desk.',
    choices: [
      {
        label: 'Take Them',
        description: 'Finder\u2019s keepers.',
        effects: { knowledge: 5 },
        grantItem: 'notes',
      },
      {
        label: 'Hand Them In to Lost & Found',
        description: 'Be a decent person about it.',
        effects: { mood: 5 },
        relationships: { teacher: 1, headman: 1 },
      },
    ],
  },

  {
    id: 'group_project',
    title: 'Group Project Opportunity',
    description:
      'The headman asks if you want to lead a group project. It\u2019s a chance to shine \u2014 or burn out.',
    choices: [
      {
        label: 'Lead the Project',
        description: 'Take charge and own it.',
        effects: { knowledge: 8, energy: -20, mood: -5, rating: 0.15 },
        relationships: { teacher: 5, headman: 8 },
      },
      {
        label: 'Help, Don\u2019t Lead',
        description: 'Pull your weight, no more.',
        effects: { knowledge: 4, energy: -10 },
        relationships: { headman: 3 },
      },
      {
        label: 'Pass on It',
        description: 'Not this semester.',
        effects: { mood: 2 },
        relationships: { headman: -4 },
      },
    ],
  },

  {
    id: 'headman_help',
    title: 'Headman Drops By',
    description:
      'The headman swings by with copies of last lecture\u2019s notes. "Figured you might want these."',
    condition: (state) => (state.relationships?.headman || 0) >= 40,
    choices: [
      {
        label: 'Thank Them',
        description: 'Genuine appreciation.',
        effects: { mood: 5, knowledge: 3 },
        relationships: { headman: 3 },
        grantItem: 'notes',
      },
      {
        label: 'Brush It Off',
        description: 'Pretend you don\u2019t need them.',
        relationships: { headman: -5 },
      },
    ],
  },

  {
    id: 'tutoring_gig',
    title: 'Tutoring Gig',
    description:
      'A first-year student asks if you\u2019d tutor them for a few hours. They\u2019re willing to pay decent money.',
    condition: (state) => state.knowledge >= 40,
    choices: [
      {
        label: 'Accept the Gig',
        description: 'Knowledge for money.',
        effects: { money: 800, energy: -15, mood: 3, knowledge: 2 },
      },
      {
        label: 'Decline Politely',
        description: 'Not enough hours in the day.',
      },
    ],
  },

  {
    id: 'library_find',
    title: 'Energy Drink Find',
    description:
      'There\u2019s a half-full energy drink left at your usual library spot. Looks fresh.',
    choices: [
      {
        label: 'Take It',
        description: 'A small score.',
        effects: { mood: 2 },
        grantItem: 'energy_drink',
      },
      {
        label: 'Leave It',
        description: 'Not your style.',
      },
    ],
  },

  {
    id: 'friend_struggling',
    title: 'Friend Is Struggling',
    description:
      'Your friend texts: "Can we talk? I\u2019m not doing great."',
    condition: (state) => (state.relationships?.friend || 0) >= 30,
    choices: [
      {
        label: 'Drop Everything and Listen',
        description: 'They needed this.',
        effects: { mood: 6, energy: -10 },
        relationships: { friend: 8 },
      },
      {
        label: 'Reschedule for Tomorrow',
        description: 'You\u2019re overloaded too.',
        effects: { mood: -2 },
        relationships: { friend: -2 },
      },
      {
        label: 'Make an Excuse',
        description: 'You can\u2019t handle this right now.',
        effects: { mood: -8 },
        relationships: { friend: -8 },
      },
    ],
  },
];

function getEligibleEvents(state) {
  return EVENTS.filter((ev) => !ev.condition || ev.condition(state));
}

// Returns one random eligible event, or null if chance or eligibility fails
function maybeFireEvent(state) {
  if (Math.random() > CONFIG.EVENT_TRIGGER_CHANCE) return null;
  const eligible = getEligibleEvents(state);
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}
