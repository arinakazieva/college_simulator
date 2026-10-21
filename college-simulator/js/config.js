'use strict';

// All game constants live here. No logic, no side effects.
const CONFIG = {
  MAX_DAY: 120,

  SLOTS: ['Morning', 'Classes', 'Lunch', 'Evening', 'Night'],

  INITIAL_STATE: {
    day: 1,
    slotIndex: 0,
    energy: 80,
    hunger: 20,
    mood: 70,
    money: 12000,
    rating: 3.0,
    knowledge: 10,
    activityLog: [],
    actionTaken: false,
    isGameOver: false,
    isWin: false,
    gameOverReason: null, // { title, message } stored so modal survives reload

    // ── Extended systems ──────────────────────────────
    relationships: { friend: 30, teacher: 20, headman: 25 },
    inventory: [],          // array of item ids; duplicates allowed
    actionStreaks: {},      // { actionId: count } — for diminishing returns
    examsDone: {},          // { '30': true, ... } — which exams are completed
    notesPrepared: false,   // flag consumed by next exam for +1 score
    // Snapshot at start of current semester (for end-of-semester deltas)
    semesterStart: { rating: 3.0, money: 12000, knowledge: 10, day: 1 },
    semestersSeen: {},        // { '30': true, ... } — semester summaries acknowledged
    pendingSemester: null,    // day-number if a semester summary is awaiting acknowledgement
  },

  // format: 'percent' | 'money' | 'rating'
  // inverted: true means high value is bad (hunger)
  STATS_CONFIG: {
    energy:    { min: 0,      max: 100,    label: 'Energy',    format: 'percent'              },
    hunger:    { min: 0,      max: 100,    label: 'Hunger',    format: 'percent', inverted: true },
    mood:      { min: 0,      max: 100,    label: 'Mood',      format: 'percent'              },
    money:     { min: -20000, max: 999999, label: 'Money',     format: 'money'                },
    rating:    { min: 0,      max: 5,      label: 'GPA',       format: 'rating'               },
    knowledge: { min: 0,      max: 100,    label: 'Knowledge', format: 'percent'              },
  },

  ACTIONS: {
    Morning: [
      {
        id: 'breakfast',
        label: 'Breakfast',
        description: 'Start the day with a proper meal.',
        effects: { hunger: -30, energy: +10, mood: +5, money: -100 },
      },
      {
        id: 'sleep_in',
        label: 'Sleep In',
        description: 'Get a bit more rest before the day starts.',
        effects: { energy: +20, mood: +8, hunger: +10 },
      },
      {
        id: 'study_early',
        label: 'Study Early',
        description: 'Get ahead on your coursework before class.',
        effects: { knowledge: +8, energy: -15, mood: -5, hunger: +10 },
      },
    ],

    Classes: [
      {
        id: 'attend',
        label: 'Attend Classes',
        description: 'Show up, take notes, and stay engaged.',
        effects: { knowledge: +12, rating: +0.1, energy: -20, hunger: +15, mood: -5 },
        relationships: { teacher: +2, headman: +1 },
      },
      {
        id: 'skip',
        label: 'Skip Classes',
        description: 'Skip class. Risky, but gives breathing room.',
        effects: { rating: -0.25, mood: +8, energy: +8, hunger: +5 },
        relationships: { teacher: -3, headman: -2 },
      },
    ],

    Lunch: [
      {
        id: 'eat',
        label: 'Eat Lunch',
        description: 'Get a proper meal at the cafeteria.',
        effects: { hunger: -40, mood: +5, energy: +10, money: -150 },
      },
      {
        id: 'socialize',
        label: 'Socialize',
        description: 'Hang out with classmates and skip the meal.',
        effects: { mood: +15, hunger: +5, energy: -5 },
        relationships: { friend: +3, headman: +1 },
      },
    ],

    Evening: [
      {
        id: 'study_evening',
        label: 'Study',
        description: 'Put in work on your coursework this evening.',
        effects: { knowledge: +10, rating: +0.05, energy: -20, mood: -10, hunger: +10 },
        relationships: { teacher: +1 },
        itemRoll: { item: 'notes', chance: 0.22 },
      },
      {
        id: 'work',
        label: 'Part-Time Work',
        description: 'Work a shift and earn some money.',
        effects: { money: +500, energy: -25, mood: -10, hunger: +15 },
        relationships: { friend: -1 },
        itemRoll: { item: 'energy_drink', chance: 0.28 },
      },
      {
        id: 'relax',
        label: 'Relax',
        description: 'Unwind and recharge for tomorrow.',
        effects: { mood: +14, energy: +10, hunger: +5 },
      },
    ],

    Night: [
      {
        id: 'sleep',
        label: 'Sleep',
        description: "Get a full night's rest.",
        effects: { energy: +40, mood: +10, hunger: +15 },
      },
    ],
  },

  GAME_OVER_CONDITIONS: [
    {
      stat: 'energy',
      check: (v) => v <= 0,
      title: 'Exhausted',
      message: 'You pushed yourself too hard and collapsed from exhaustion.',
    },
    {
      stat: 'mood',
      check: (v) => v <= 0,
      title: 'Burned Out',
      message: 'Accumulated stress and burnout pulled you out of the game.',
    },
    {
      stat: 'hunger',
      check: (v) => v >= 100,
      title: 'Starving',
      message: 'You neglected to eat regularly and collapsed from hunger.',
    },
    {
      stat: 'money',
      check: (v) => v <= -20000,
      title: 'Bankrupt',
      message: 'Your debt spiraled out of control with no way back.',
    },
  ],

  // Probability of a random event firing after each slot advance
  EVENT_TRIGGER_CHANCE: 0.25,

  LOG_MAX_ENTRIES: 50,

  STORAGE_KEY: 'college_sim_v1',

  // ── NPCs ────────────────────────────────────────
  NPCS: {
    friend:  { label: 'Friend',  description: 'Your closest college friend.'  },
    teacher: { label: 'Teacher', description: 'Senior course professor.'      },
    headman: { label: 'Headman', description: 'Group leader and class rep.'   },
  },

  RELATIONSHIP_RANGE: { min: 0, max: 100 },

  // ── Inventory items ─────────────────────────────
  // Each item's use() returns an object describing what to apply:
  //   { effects?: {...}, flag?: 'flagName', message: string, consume?: boolean }
  ITEMS: {
    energy_drink: {
      label: 'Energy Drink',
      description: 'A jolt of caffeine. +25 energy.',
      use: function () {
        return {
          effects: { energy: 25, hunger: 8, mood: 3 },
          message: 'You crack open an energy drink and feel an immediate surge.',
          consume: true,
        };
      },
    },
    notes: {
      label: 'Study Notes',
      description: 'Bonus on your next exam (+1 question).',
      use: function () {
        return {
          flag: 'notesPrepared',
          message: 'Notes prepared \u2014 ready for your next exam.',
          consume: true,
        };
      },
    },
  },

  // ── Exam system ─────────────────────────────────
  EXAM_DAYS: [30, 60, 90, 120],
  EXAM_DURATION: 75,        // seconds for the entire quiz
  EXAM_QUESTIONS_PER_RUN: 5,

  EXAM_QUESTIONS: [
    {
      q: 'What does HTML stand for?',
      choices: [
        'HyperText Markup Language',
        'Home Tool Markup Language',
        'Hyperlink Transfer Markup Layout',
        'High-Text Machine Layout',
      ],
      correct: 0,
    },
    {
      q: 'Which keyword declares a constant in modern JavaScript?',
      choices: ['var', 'let', 'const', 'final'],
      correct: 2,
    },
    {
      q: 'What does CSS stand for?',
      choices: [
        'Computed Styling Syntax',
        'Cascading Style Sheets',
        'Coded Style System',
        'Centralized Style Source',
      ],
      correct: 1,
    },
    {
      q: 'What is the result of 2 + "2" in JavaScript?',
      choices: ['4', '"22"', 'NaN', 'undefined'],
      correct: 1,
    },
    {
      q: 'Which is NOT a loop construct?',
      choices: ['for', 'while', 'do...while', 'if'],
      correct: 3,
    },
    {
      q: 'HTTP stands for?',
      choices: [
        'High Transfer Text Protocol',
        'HyperText Transfer Protocol',
        'Hyper Transmission Tool Protocol',
        'Host Text Transfer Pipeline',
      ],
      correct: 1,
    },
    {
      q: 'What is recursion?',
      choices: [
        'A function calling itself',
        'A loop that never ends',
        'A type of variable',
        'Memory cleanup',
      ],
      correct: 0,
    },
    {
      q: 'Time complexity of binary search?',
      choices: ['O(n)', 'O(n log n)', 'O(log n)', 'O(n^2)'],
      correct: 2,
    },
    {
      q: 'Which value is "falsy" in JavaScript?',
      choices: ['"0"', '[]', '0', '"false"'],
      correct: 2,
    },
    {
      q: 'Which method adds an item to the end of an array?',
      choices: ['shift()', 'push()', 'pop()', 'unshift()'],
      correct: 1,
    },
    {
      q: 'Boolean result of: !!"" ?',
      choices: ['true', 'false', 'undefined', 'error'],
      correct: 1,
    },
    {
      q: 'Which protocol secures HTTP?',
      choices: ['TCP', 'SSH', 'TLS', 'FTP'],
      correct: 2,
    },
  ],

  // ── Game balance: diminishing returns ──────────
  // When you repeat the same action: streak grows and amplifies its negative effects.
  // Only applied in slots that have more than one available action.
  STREAK_THRESHOLD: 3,
  STREAK_STEP: 0.2,
  STREAK_MAX_MULTIPLIER: 1.7,

  // ── Semester system ─────────────────────────────
  // Day boundaries (end-of-semester triggers; day 120 is graduation, not a semester)
  SEMESTER_DAYS:        [30, 60, 90],
  SEMESTER_TOTAL:       4,
  PROBATION_THRESHOLD:  2.0,   // GPA at semester end => probation warning
  EXPULSION_THRESHOLD:  1.0,   // GPA at semester end => game over

  // ── Endings (evaluated top-down; first match wins) ─────
  // Conditions receive (state, helpers). Helpers: { avgRel }.
  ENDINGS: [
    {
      id: 'excellent',
      title: 'Excellent Graduate',
      condition: (s, h) => s.rating >= 4.0 && h.avgRel >= 50 && s.mood >= 40,
      narrative:
        'You walked across that stage with your head held high. Strong grades, good people around you, ' +
        'and the mental capacity to actually enjoy graduation day. Hard to ask for more.',
    },
    {
      id: 'scholar',
      title: 'Academic Achiever',
      condition: (s) => s.rating >= 4.0,
      narrative:
        'You earned every percentage point. Your transcript will open doors \u2014 ' +
        'even if those weekends in the library cost you a social life.',
    },
    {
      id: 'social',
      title: 'Beloved Classmate',
      condition: (s, h) => h.avgRel >= 70,
      narrative:
        'Your GPA was nothing special, but everyone remembers your name. ' +
        'You leave with friends, contacts, and stories worth telling.',
    },
    {
      id: 'career',
      title: 'Career-Focused Graduate',
      condition: (s) => s.money >= 30000 && s.rating >= 2.5,
      narrative:
        'You treated college like a means to an end \u2014 and the end was a healthy bank balance. ' +
        "Practical, if a little joyless. You're set up for what comes next.",
    },
    {
      id: 'burnout',
      title: 'Burned Out Survivor',
      condition: (s) => s.mood < 30 && s.rating >= 2.0,
      narrative:
        'You got the diploma. Barely. The cost was steep \u2014 sleep, friendships, peace of mind. ' +
        'Take some time before deciding what comes next.',
    },
    {
      id: 'quiet_pass',
      title: 'Quiet Pass',
      condition: (s) => s.rating >= 2.0,
      narrative:
        'No fireworks, no fanfare. You walked the line and walked away with a degree. ' +
        'Sometimes that\u2019s exactly enough.',
    },
    {
      id: 'below_line',
      title: 'Below the Line',
      condition: () => true,                          // fallback
      narrative:
        'You made it through 120 days, but your transcript tells a rough story. ' +
        'Reconsider, regroup, and figure out what actually matters to you.',
    },
  ],
};
