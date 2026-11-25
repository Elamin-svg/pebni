// Made by scripts/make-stories.ts: each bundled story's sound file, by its id.
import lionAndMouse from "./lion-and-mouse.mp3";
import hareAndTortoise from "./hare-and-tortoise.mp3";
import crowAndPitcher from "./crow-and-pitcher.mp3";
import foxAndGrapes from "./fox-and-grapes.mp3";
import townAndCountryMouse from "./town-and-country-mouse.mp3";
import northWindAndSun from "./north-wind-and-sun.mp3";
import realPrincess from "./real-princess.mp3";
import elvesAndShoemaker from "./elves-and-shoemaker.mp3";
import frogPrince from "./frog-prince.mp3";
import emperorsNewClothes from "./emperors-new-clothes.mp3";
import swineherd from "./swineherd.mp3";
import firTree from "./fir-tree.mp3";

export const STORY_FILES: Record<string, string> = {
	"story:lion-and-mouse": lionAndMouse,
	"story:hare-and-tortoise": hareAndTortoise,
	"story:crow-and-pitcher": crowAndPitcher,
	"story:fox-and-grapes": foxAndGrapes,
	"story:town-and-country-mouse": townAndCountryMouse,
	"story:north-wind-and-sun": northWindAndSun,
	"story:real-princess": realPrincess,
	"story:elves-and-shoemaker": elvesAndShoemaker,
	"story:frog-prince": frogPrince,
	"story:emperors-new-clothes": emperorsNewClothes,
	"story:swineherd": swineherd,
	"story:fir-tree": firTree,
};
