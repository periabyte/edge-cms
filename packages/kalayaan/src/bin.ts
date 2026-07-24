#!/usr/bin/env node
// Thin proxy so `npx kalayaan` works from a single `npm install kalayaan`,
// without duplicating the CLI implementation (owned by @edgecms/cli).
import "@edgecms/cli/bin";
