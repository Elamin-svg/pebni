// Public domain barrel for Pebni's pure core (zero OS, Bun, Node, or DOM dependencies).
// Organized into five bounded domain slices: timer, audio, atmosphere, analytics, settings.
export * from "./timer/timer";
export * from "./timer/engine";
export * from "./timer/rule";
export * from "./timer/presets";
export * from "./timer/breaks";
export * from "./timer/flow";
export * from "./timer/hold";
export * from "./timer/idle-reset";
export * from "./timer/first-input";
export * from "./timer/notice";
export * from "./timer/updates";

export * from "./audio/break-audio";
export * from "./audio/library";
export * from "./audio/story-list";

export * from "./atmosphere/day-part";
export * from "./atmosphere/scenes";
export * from "./atmosphere/quotes";
export * from "./atmosphere/break-copy";
export * from "./atmosphere/hold-copy";
export * from "./atmosphere/tray-label";

export * from "./analytics/stats";
export * from "./analytics/history";
export * from "./analytics/format";

export * from "./settings/prefs";
export * from "./settings/shortcuts";
export * from "./settings/focus-apps";
export * from "./settings/app-names";
