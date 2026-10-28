/**
 * What the new-topic form suggests in each room (the owner, 2026-10-28): an
 * example title, and what the first post might say, in the room's own terms
 * rather than one example for every room.
 *
 * Matched by the room's name, then by its id: a renamed room follows its new
 * name, and an id still finds one whose name changed past recognition. A room
 * with neither gets the general prompt.
 */
export interface RoomPrompt {
  title: string;
  body: string;
}

export const GENERAL_PROMPT: RoomPrompt = {
  title: 'A question, or something worth sharing',
  body: 'Ask something, share what worked for you, or say what happened — whatever you want the room to have.',
};

interface Entry extends RoomPrompt {
  ids: string[];
  /** The room's name, as a pattern, for a room whose id is not listed. */
  name: RegExp;
}

const PROMPTS: Entry[] = [
  {
    ids: ['bowel'],
    name: /bowel/i,
    title: 'Keeping my bowel programme on track while travelling',
    body: 'Your routine, what changed, and what you have tried. Timing, products and diet all help others answer.',
  },
  {
    ids: ['bladder'],
    name: /bladder|catheter/i,
    title: 'Cathing at work without a private bathroom',
    body: 'How you manage now, what is getting in the way, and any supplies or routines you have tried.',
  },
  {
    ids: ['skin'],
    name: /skin|pressure/i,
    title: 'Which cushion helped you heal a pressure sore?',
    body: 'Where it is, how long it has been, and what you are doing for it now. A photo of a cushion or setup can help; keep wounds out of it.',
  },
  {
    ids: ['pain'],
    name: /pain/i,
    title: 'Nerve pain that is worse at night',
    body: 'What it feels like, when it comes, and what you have tried, from medication to stretching to anything else.',
  },
  {
    ids: ['aging'],
    name: /aging|ageing/i,
    title: 'When did you switch to a power chair?',
    body: 'How long since your injury, what is changing, and what you are weighing up.',
  },
  {
    ids: ['general'],
    name: /^general$/i,
    title: 'Anyone else in the South Bay?',
    body: 'Anything at all. If it fits another room better, it can be moved there later.',
  },
  {
    ids: ['other'],
    name: /^other$/i,
    title: 'Something that does not fit anywhere else',
    body: 'Say what is on your mind. It can be moved to the right room later.',
  },
  {
    ids: ['equip'],
    name: /equipment|assistive|tech/i,
    title: 'Power assist: SmartDrive or Batec?',
    body: 'What you use now, what you need it to do, and your budget or funding. Photos of your setup help.',
  },
  {
    ids: ['driving'],
    name: /driving|vehicle/i,
    title: 'Getting a driving evaluation in the Bay Area',
    body: 'Your level, your car or the one you are looking at, and where you are stuck: evaluation, controls, funding or loading the chair.',
  },
  {
    ids: ['app-feedback-7960'],
    name: /^app feedback$/i,
    title: 'The map is hard to zoom on my phone',
    body: 'What happened, what you expected, or what you’d like the app to do. A screenshot helps.',
  },
  {
    ids: ['newsci'],
    name: /newly injured|new injur/i,
    title: 'Going home from rehab next month: what should I sort out first?',
    body: 'Nothing is too basic to ask here. Say where you are in rehab or recovery, and what is on your mind.',
  },
  {
    ids: ['intimacy'],
    name: /sex|dating|fertility|intimacy/i,
    title: 'When did you tell a date about your injury?',
    body: 'Plain language is welcome here. Share as much or as little as you like.',
  },
  {
    ids: ['work'],
    name: /work|school/i,
    title: 'Asking for accommodations at a new job',
    body: 'Your field or course, what you need, and how far you have got with your employer or school.',
  },
  {
    ids: ['sport'],
    name: /sport/i,
    title: 'Where can I try handcycling near San Jose?',
    body: 'The sport, your level, and whether you have tried it before. Where you are helps people point you to a club.',
  },
  {
    ids: ['funding'],
    name: /funding|benefit/i,
    title: 'Appealing a denied SSDI claim',
    body: 'Which program, where you are in the process, and what the letter said. Leave out case numbers and personal details.',
  },
  {
    ids: ['cooking-ba1c'],
    name: /cook/i,
    title: 'One-pan dinner I can make from my chair',
    body: 'What you made, how you made it work in your kitchen, and a photo of the result.',
  },
  {
    ids: ['travel-tips-and-tricks-caa9'],
    name: /travel/i,
    title: 'Accessible hotel in San Diego with a roll-in shower',
    body: 'Where you went or are going, what was accessible and what was not, and any tips for getting there.',
  },
  {
    ids: ['events-15df'],
    name: /^events$/i,
    title: 'Photos from Saturday’s handcycling clinic',
    body: 'Which event, when and where, and what you want to share or ask about it.',
  },
];

export function roomPrompt(room: { id: string; name: string } | null): RoomPrompt {
  if (!room) return GENERAL_PROMPT;
  // By name first: a renamed room's examples follow what it is now called.
  const found =
    PROMPTS.find((entry) => entry.name.test(room.name.trim())) ??
    PROMPTS.find((entry) => entry.ids.includes(room.id));
  return found ? { title: found.title, body: found.body } : GENERAL_PROMPT;
}
