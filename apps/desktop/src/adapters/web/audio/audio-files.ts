// The sound files bundled with the app (made with ElevenLabs, see scripts/make-audio.ts).
// The meditations and the breathing loop are voice; the nature sounds loop seamlessly.
import type { MeditationTrack, NatureSound } from "../../../core/audio/break-audio";
import meditation3 from "./meditation-3.mp3";
import meditation5 from "./meditation-5.mp3";
import meditation10 from "./meditation-10.mp3";
import breathingLoop from "./breathing-loop.mp3";
import rain from "./nature-rain.mp3";
import fire from "./nature-fire.mp3";
import evening from "./nature-evening.mp3";
import morning from "./nature-morning.mp3";
import night from "./nature-night.mp3";

export const MEDITATION_FILES: Record<MeditationTrack, string> = {
	"meditation-3": meditation3,
	"meditation-5": meditation5,
	"meditation-10": meditation10,
};

// One breath: "breathe in" at 0 s, "breathe out" at 4 s, 10 s in all (matches sound.css).
export const BREATHING_LOOP = breathingLoop;

export const NATURE_FILES: Record<NatureSound, string> = { rain, fire, evening, morning, night };

// What each nature sound is called on the break screen.
export const NATURE_NAMES: Record<NatureSound, string> = {
	rain: "Rain on the window",
	fire: "A crackling fire",
	evening: "Crickets at dusk",
	morning: "Birds in the morning",
	night: "A quiet night",
};
