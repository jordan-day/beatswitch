# BeatSwitch

A beginner-friendly lo-fi beat maker that runs in the browser. No DAW experience needed.

- **Beat:** a step grid for kick, snare, hats and percussion, plus a bass line that follows the chords (root, fifth or octave per step).
- **Chords:** pick a mood and key, start from a progression, or build each chord yourself. Each chord shows its notes on a keyboard and suggests what sounds good next.
- **Melody:** a piano roll locked to your key, with the current chord's notes highlighted so every note fits.
- **Lo-fi-ness:** one knob for vinyl crackle, tape wobble, muffle, crunch and room sound.
- Save beats in your browser, share them as links or files, and export a WAV.

## Run it locally

```sh
npm install
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests |
| `npm run build` | Build the static site into `dist/` |
| `npm run build:artifact` | Build the version used as a Claude artifact |

Pushing to `main` builds the site and deploys it to GitHub Pages (see `.github/workflows/deploy.yml`).

Built with React, TypeScript, Vite, Tone.js and Tonal.

## Sounds

Recorded instruments (🎙 in the app: acoustic drum kit, clap, shaker, tambourine, upright piano,
vibraphone, kalimba, glockenspiel and ocarina) come from the
[Versilian Community Sample Library](https://github.com/sgossner/VCSL) by Versilian Studios,
released as CC0 (public domain). See [`public/samples/CREDITS.md`](public/samples/CREDITS.md).
To rebuild them, download the files listed in `scripts/vcsl-files.txt` and run
`node scripts/process-samples.mjs <raw dir> public/samples`. Everything else is synthesized in the browser.
