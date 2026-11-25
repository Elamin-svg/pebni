// Break scenes follow the time of day and stay stable across repeated breaks.
import { expect, test } from "bun:test";
import { breakScene } from "./scenes";

test("each part of the day has its own scene", () => {
	expect(breakScene("morning", 0)).toBe("morning-window");
	expect(breakScene("day", 3)).toBe("rain-window");
	expect(breakScene("evening", 1)).toBe("evening-cabin");
	expect(breakScene("night", 2)).toBe("fireplace");
});
