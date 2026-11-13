import { createContext, type Context } from "react";
import type { FancyCatalog } from "./catalog";

const KEY = Symbol.for("particle-academy.fancy-i18n.context");
const G = globalThis as { [KEY]?: Context<FancyCatalog | null> };

/**
 * Created once per JavaScript realm, under a global symbol, so two installed
 * copies of fancy-i18n (a resolver choosing two versions) still share the
 * host's provider.
 */
export const FancyI18nContext: Context<FancyCatalog | null> = G[KEY] ?? (G[KEY] = createContext<FancyCatalog | null>(null));
