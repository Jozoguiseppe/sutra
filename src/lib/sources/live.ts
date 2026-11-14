import type { SourceAdapter } from './types';
import { openmeteoAdapter } from './openmeteo';
import { frankfurterAdapter } from './frankfurter';
import { krakenAdapter } from './kraken';
import { emscAdapter } from './emsc';
// Real-world adapters. Active only when SOURCES=live. All endpoint details are UNVERIFIED (see each file).
export const liveAdapters: SourceAdapter[] = [openmeteoAdapter, frankfurterAdapter, krakenAdapter, emscAdapter];
