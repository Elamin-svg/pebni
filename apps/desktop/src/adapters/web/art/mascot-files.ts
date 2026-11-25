// The app logo and 12 transparent mascot state illustrations, bundled by Vite.
import appLogo from "./logo.png";
import wave from "./mascot/wave.png";
import pout from "./mascot/pout.png";
import shrug from "./mascot/shrug.png";
import wait from "./mascot/wait.png";
import chill from "./mascot/chill.png";
import dnd from "./mascot/dnd.png";
import eyes from "./mascot/eyes.png";
import stretch from "./mascot/stretch.png";
import posture from "./mascot/posture.png";
import water from "./mascot/water.png";
import coffee from "./mascot/coffee.png";
import stroll from "./mascot/stroll.png";

export type MascotPose =
	| "wave" | "pout" | "shrug" | "wait"
	| "chill" | "dnd" | "eyes" | "stretch"
	| "posture" | "water" | "coffee" | "stroll";

export const APP_LOGO = appLogo;

export const MASCOT_FILES: Record<MascotPose, string> = {
	wave,
	pout,
	shrug,
	wait,
	chill,
	dnd,
	eyes,
	stretch,
	posture,
	water,
	coffee,
	stroll,
};
