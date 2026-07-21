#!/usr/bin/env node
// Thin proxy so `npx edgecms` works from a single `npm install edgecms`,
// without duplicating the CLI implementation (owned by @edgecms/cli).
import "@edgecms/cli/bin";
