// What the voice says in each bundled track, and when (seconds from the start).
// scripts/make-audio.ts turns this into the mp3 files in src/mainview/audio/.

// One spoken line at a fixed time in the track.
export type Line = { at: number; text: string };

// A voice track: its exact length and its lines.
export type VoiceTrack = { file: string; seconds: number; lines: Line[] };

// Guided breaths, one every 10 s: in for four, out for six (the same rhythm as sound.css).
function breaths(start: number, count: number): Line[] {
	const out: Line[] = [];
	for (let i = 0; i < count; i++) {
		out.push({ at: start + i * 10, text: "Breathe in." });
		out.push({ at: start + i * 10 + 4, text: "And out." });
	}
	return out;
}

// Opening lines shared by every meditation, so they all start the same calm way.
function opening(minutes: number): Line[] {
	return [
		{ at: 1, text: `Welcome. For the next ${minutes} minutes, there is nothing you need to do.` },
		{ at: 9, text: "Let your shoulders drop. Let your hands rest." },
		{ at: 17, text: "If you like, close your eyes, or let them rest on something far away." },
		{ at: 27, text: "Let's breathe together. In for four, out for six." },
	];
}

// Closing lines, timed to end a few seconds before the track does.
function closing(end: number): Line[] {
	return [
		{ at: end - 20, text: "Slowly, open your eyes if they were closed." },
		{ at: end - 12, text: "Look at something far away for a moment. Then come back, rested." },
	];
}

export const MEDITATIONS: VoiceTrack[] = [
	{
		file: "meditation-3.mp3",
		seconds: 180,
		lines: [
			...opening(3),
			...breaths(35, 4),
			{ at: 78, text: "Good. Now let the breath find its own pace." },
			{ at: 90, text: "Notice the air. Cool as it comes in, warm as it leaves." },
			{ at: 104, text: "If a thought arrives, that is fine. Let it pass, like a cloud." },
			{ at: 118, text: "Back to the breath." },
			...breaths(124, 3),
			...closing(180),
		],
	},
	{
		file: "meditation-5.mp3",
		seconds: 300,
		lines: [
			...opening(5),
			...breaths(35, 4),
			{ at: 78, text: "Now let the breath go on by itself. You don't need to steer it." },
			{ at: 92, text: "Bring your attention to your forehead. Let it soften." },
			{ at: 106, text: "Your eyes. Let them rest deep in their sockets." },
			{ at: 120, text: "Your jaw. Let your teeth come apart a little." },
			{ at: 136, text: "Your neck and shoulders. Let them be heavy." },
			{ at: 152, text: "Your hands. Warm, still, with nothing to hold." },
			{ at: 170, text: "Just sit for a while, and listen to the room around you." },
			{ at: 200, text: "If your mind has wandered, gently come back to the breath." },
			...breaths(212, 5),
			{ at: 266, text: "Stay here a few more breaths." },
			...closing(300),
		],
	},
	{
		file: "meditation-10.mp3",
		seconds: 600,
		lines: [
			...opening(10),
			...breaths(35, 5),
			{ at: 88, text: "Now let the breath go on by itself." },
			{ at: 100, text: "Feel where your body touches the chair. Let it carry you." },
			{ at: 118, text: "Your feet on the floor. Heavy and steady." },
			{ at: 136, text: "Your legs. Let them rest." },
			{ at: 154, text: "Your belly. Let it rise and fall as it wants to." },
			{ at: 174, text: "Your back. Let it lean, and let the chair do the work." },
			{ at: 194, text: "Your shoulders. Let them sink, a little more with every breath out." },
			{ at: 216, text: "Your arms and hands. Warm and still." },
			{ at: 236, text: "Your face. Your forehead, your eyes, your jaw. All soft." },
			{ at: 262, text: "Now just rest here, and listen." },
			{ at: 300, text: "Notice the sounds far away. Then the sounds close by." },
			{ at: 340, text: "If a thought pulls you along, that's fine. Notice it, and come back." },
			...breaths(380, 5),
			{ at: 432, text: "Let the breath be free again." },
			{ at: 470, text: "Think of one thing you are glad about today. Small is fine." },
			{ at: 510, text: "Hold it for a moment, and let it go." },
			{ at: 540, text: "Begin to notice the room again. The light, the air, the sounds." },
			{ at: 560, text: "Move your fingers and toes a little." },
			...closing(600),
		],
	},
];

// The breathing loop: one breath, repeated for as long as the break lasts.
export const BREATHING_LOOP: VoiceTrack = {
	file: "breathing-loop.mp3",
	seconds: 10,
	lines: [
		{ at: 0, text: "Breathe in." },
		{ at: 4, text: "Breathe out." },
	],
};

// Nature loops, made with ElevenLabs sound effects; the file name matches audio-files.ts.
export const NATURE_PROMPTS: { file: string; prompt: string }[] = [
	{ file: "nature-rain.mp3", prompt: "Steady soft rain on a window pane, calm, no thunder, close and cozy" },
	{ file: "nature-fire.mp3", prompt: "A small crackling fireplace, gentle pops, warm and calm, no voices" },
	{ file: "nature-evening.mp3", prompt: "Crickets at dusk in a quiet meadow, soft and calm, distant" },
	{ file: "nature-morning.mp3", prompt: "Gentle morning birdsong in a quiet garden, a few birds, calm" },
	{ file: "nature-night.mp3", prompt: "A quiet night outdoors, soft wind in grass, a distant owl now and then" },
];
