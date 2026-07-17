export { default } from "./NextActions";
export type { NextAction, NextActionVariant } from "./NextActions";

/** @deprecated Use NextActions */
export type QuickAction = import("./NextActions").NextAction;

/** @deprecated Use NextActionVariant */
export type QuickActionVariant = import("./NextActions").NextActionVariant;
