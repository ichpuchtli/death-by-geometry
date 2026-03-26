import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const gridWarsRoot = path.join(repoRoot, 'docs', 'GridWars54');
const outputRoot = path.join(repoRoot, 'docs', 'gridwars54-analysis');

const GRIDWARS_REFS = {
  readme: 'docs/GridWars54/Readme.txt:9',
  images: 'docs/GridWars54/images.bmx:7',
  sounds: 'docs/GridWars54/sound.bmx:84',
  music: 'docs/GridWars54/sound.bmx:265',
  powerups: 'docs/GridWars54/gridwars.bmx:2717',
  enemyShowcase: 'docs/GridWars54/gridwars.bmx:3985',
};

const GG_REFS = {
  factory: 'web/src/game.ts:157',
  pools: 'web/src/spawner/spawn-patterns.ts:4',
  audioConfig: 'web/src/config.ts:317',
  audioRuntime: 'web/src/core/audio.ts:1',
  spawnSfx: 'web/src/game.ts:1587',
};

const ENEMY_SEMANTICS = [
  { assetId: 'pinkpinwheel', originalName: 'Paul the Pinwheel', scoreText: '25 pts', currentGgType: 'pinwheel', status: 'direct', notes: ['Direct visual/name match.', 'Current GG already has an active Pinwheel enemy.'] },
  { assetId: 'bluediamond', originalName: 'Dimmy the Diamond', scoreText: '50 pts', currentGgType: 'rhombus', status: 'approximate', notes: ['Closest current GG counterpart is Rhombus.', 'Shape/family aligns, but naming and score differ.'] },
  { assetId: 'greensquare', originalName: 'Shy the Square', scoreText: '100 pts', currentGgType: 'square', status: 'partial', notes: ['Current GG Square exists, but the original also distinguishes Cubie the Cube as a child/split form.'] },
  { assetId: 'purplesquare1', originalName: 'Cubie the Cube', scoreText: '50/100 pts', currentGgType: 'square2', status: 'partial', notes: ['Current GG Square2 covers the child role, but naming/score tuning differ.'] },
  { assetId: 'bluecircle', originalName: 'Sammy the Seeker', scoreText: '10 pts', currentGgType: 'circle', status: 'missing-active', notes: ['Current GG Circle exists only as a child spawned from BlackHole overload, not as an active spawn-pool enemy.'] },
  { assetId: 'redcircle', originalName: 'Dwight the Black Hole', scoreText: '150 pts', currentGgType: 'blackhole', status: 'direct-evolved', notes: ['Direct thematic match.', 'Current GG BlackHole is much more elite/boss-like than the original Grid Wars scoring suggests.'] },
  { assetId: 'snakehead', originalName: 'Selena the Snake', scoreText: '100 pts', currentGgType: null, status: 'missing', notes: ['No active Snake equivalent in the current GG roster.'] },
  { assetId: 'redclone', originalName: 'Ivan the Interceptor', scoreText: '100 pts', currentGgType: null, status: 'missing', notes: ['No active Interceptor/Clone equivalent in the current GG roster.'] },
  { assetId: 'orangetriangle', originalName: 'Trish the Triangle', scoreText: '150 pts', currentGgType: null, status: 'unwired', notes: ['Triangle enemy source exists in GG but is not wired into pools/factory.'] },
  { assetId: 'indigotriangle', originalName: 'Indy the Butterfly', scoreText: '10 pts', currentGgType: null, status: 'missing', notes: ['No active Butterfly equivalent in the current GG roster.'] },
  { assetId: 'whiteplayer', originalName: 'Your Ship', scoreText: null, currentGgType: 'player', status: 'different-style', notes: ['Current GG uses a procedural vector ship rather than the original sprite.'] },
  { assetId: 'yellowshot', originalName: 'Player Shot', scoreText: null, currentGgType: 'bullet', status: 'different-style', notes: ['Current GG uses a red vector bullet rather than the original yellow sprite.'] },
];

const POWERUP_SEMANTICS = [
  { kind: 0, frame: 2, codeName: 'back shooter', label: 'Temporary Back Shooter' },
  { kind: 1, frame: 3, codeName: 'side shooters', label: 'Temporary Side Shooters' },
  { kind: 2, frame: 0, codeName: 'xtra bullet b', label: 'Extra Front Shooter' },
  { kind: 3, frame: 5, codeName: 'shot speed', label: 'Extra Shot Speed' },
  { kind: 4, frame: 6, codeName: 'free ship', label: 'Extra Player' },
  { kind: 5, frame: 8, codeName: 'free bomb', label: 'Extra Bomb' },
  { kind: 6, frame: 9, codeName: 'shield', label: 'Temporary Shield' },
  { kind: 7, frame: 7, codeName: 'supershots', label: 'Super Shots' },
  { kind: 8, frame: 10, codeName: 'bouncyshots', label: 'Bouncy Shots' },
];

const SOUND_BINDINGS = [
  { variable: 'nme_born_snd', file: 'buzz3.wav', usage: 'generic enemy born' },
  { variable: 'nme1_born_snd', file: 'pop2.wav', usage: 'pinwheel born' },
  { variable: 'nme2_born_snd', file: 'pop3.wav', usage: 'diamond born' },
  { variable: 'nme3_born_snd', file: 'snake1.wav', usage: 'snake born' },
  { variable: 'nme4_born_snd', file: 'gruntborn.wav', usage: 'square born' },
  { variable: 'nme5_born_snd', file: 'sun1.wav', usage: 'black hole born' },
  { variable: 'nme5_loop_snd', file: 'bondloop.wav', usage: 'black hole loop' },
  { variable: 'nme5_shrink_snd', file: 'sunhit1.wav', usage: 'black hole shrink / hit' },
  { variable: 'nme5_grow_snd', file: 'sizzle1.wav', usage: 'black hole grow' },
  { variable: 'nme5_explode_snd', file: 'sunexp.wav', usage: 'black hole explode' },
  { variable: 'nme5_killed_snd', file: 'Explo1.wav', usage: 'black hole killed / bomb' },
  { variable: 'nme6_born_snd', file: 'wee.wav', usage: 'butterfly or fast enemy born' },
  { variable: 'nme6_tailexplode_snd', file: 'snakehit.wav', usage: 'snake tail explode' },
  { variable: 'nme6_tailhit_snd', file: 'tailhit.wav', usage: 'snake tail hit' },
  { variable: 'nme7_born_snd', file: 'warn1.wav', usage: 'interceptor born' },
  { variable: 'nme7_shield_snd', file: 'shield1.wav', usage: 'shielded enemy cue' },
  { variable: 'nme8_born_snd', file: 'butterfly.wav', usage: 'butterfly born' },
  { variable: 'ge_born_snd', file: 'cat.wav', usage: 'generator born' },
  { variable: 'ge_hit_snd', file: 'genhit1.wav', usage: 'generator hit' },
  { variable: 'ge_killed_snd', file: 'genkilled1.wav', usage: 'generator killed' },
  { variable: 'le_born_snd', file: 'buzz1.wav', usage: 'line enemy born' },
  { variable: 'le_hit_snd', file: 'echo1.wav', usage: 'line enemy hit' },
  { variable: 'le_killed_snd', file: 'elastic.wav', usage: 'line enemy killed' },
  { variable: 'pu_collect_snd', file: 'bonus1.wav', usage: 'powerup collect' },
  { variable: 'get_ready_snd', file: 'startup.wav', usage: 'get ready / startup' },
  { variable: 'player_hit_snd', file: 'die1.wav', usage: 'player hit / life lost' },
  { variable: 'shot_born_snd', file: 'shotborn.wav', usage: 'player shot fired' },
  { variable: 'shot_hit_wall_snd', file: 'shotwall.wav', usage: 'shot hits wall' },
  { variable: 'game_over_snd', file: 'gameover.wav', usage: 'game over' },
  { variable: 'super_bomb_snd', file: 'Explo1.wav', usage: 'super bomb' },
  { variable: 'extra_life_snd', file: 'brainborn.wav', usage: 'extra life' },
  { variable: 'extra_bomb_snd', file: 'buzz2.wav', usage: 'extra bomb' },
  { variable: 'multiplier_increase_snd', file: 'bonus2.wav', usage: 'multiplier increase' },
  { variable: 'bonus_born_snd', file: 'bonusborn.wav', usage: 'bonus spawned' },
  { variable: 'high_score_snd', file: 'bonus1.wav', usage: 'high score' },
  { variable: 'quarkhitsound', file: 'quarkhit.wav', usage: 'quark hit' },
  { variable: 'quarkhit2sound', file: 'quarkhit2.wav', usage: 'alternate quark hit' },
  { variable: 'shieldwarningsnd', file: 'shieldwarning.wav', usage: 'shield warning (referenced, file missing)' },
];

const MUSIC_TRACK_USAGE = [
  { songId: 0, file: 'Theme0.it', role: 'intro / menu', oldRevision: null },
  { songId: 1, file: 'Theme1.it', role: 'in-game', oldRevision: 'Theme1.it-old' },
  { songId: 2, file: 'Theme2.it', role: 'hi-score', oldRevision: null },
];

const GG_ALIGNMENT = [
  {
    gridWarsConcept: 'Pinwheel',
    gridWarsAssets: ['pinkpinwheel'],
    ggCounterpart: 'pinwheel',
    status: 'already-aligned',
    notes: ['Direct enemy family match.', 'Current spawn pools already include Pinwheel from tutorial onward.'],
  },
  {
    gridWarsConcept: 'Diamond / Rhombus',
    gridWarsAssets: ['bluediamond'],
    ggCounterpart: 'rhombus',
    status: 'rename-tuning',
    notes: ['Gameplay role is close.', 'If port fidelity matters, consider aliasing the family as Diamond or Dimmy in UI/lore.'],
  },
  {
    gridWarsConcept: 'Square + Cube split',
    gridWarsAssets: ['greensquare', 'purplesquare1', 'purplesquare2'],
    ggCounterpart: 'square + square2',
    status: 'mechanically-close',
    notes: ['Current GG already supports a parent/child split.', 'Scoring, naming, and sprite treatment differ.'],
  },
  {
    gridWarsConcept: 'Seeker',
    gridWarsAssets: ['bluecircle'],
    ggCounterpart: 'circle',
    status: 'needs-reenable',
    notes: ['Current GG Circle exists but is only a child spawned from BlackHole overload.', 'To match Grid Wars more closely, add Circle back into at least some active spawn pools.'],
  },
  {
    gridWarsConcept: 'Black Hole',
    gridWarsAssets: ['redcircle'],
    ggCounterpart: 'blackhole',
    status: 'overpowered-relative-to-source',
    notes: ['Current GG BlackHole is a major elite hazard with HP and crowd-control.', 'If fidelity is the goal, retune score/rarity and consider a lighter-weight baseline variant.'],
  },
  {
    gridWarsConcept: 'Snake',
    gridWarsAssets: ['snakehead', 'snaketail'],
    ggCounterpart: null,
    status: 'missing',
    notes: ['No active GG equivalent.', 'This is a high-value porting target because both art and dedicated SFX already exist in the source bundle.'],
  },
  {
    gridWarsConcept: 'Interceptor',
    gridWarsAssets: ['redclone'],
    ggCounterpart: null,
    status: 'missing',
    notes: ['No active GG equivalent.', 'Original-specific family that would materially increase authenticity.'],
  },
  {
    gridWarsConcept: 'Triangle',
    gridWarsAssets: ['orangetriangle'],
    ggCounterpart: 'triangle',
    status: 'source-present-unwired',
    notes: ['GG already has an unwired Triangle source file.', 'This is the easiest roster item to restore.'],
  },
  {
    gridWarsConcept: 'Butterfly',
    gridWarsAssets: ['indigotriangle'],
    ggCounterpart: null,
    status: 'missing',
    notes: ['No active GG equivalent.', 'Original art and SFX naming suggest a distinct family worth reintroducing.'],
  },
  {
    gridWarsConcept: 'Music',
    gridWarsAssets: ['Theme0.it', 'Theme1.it', 'Theme2.it'],
    ggCounterpart: 'procedural music + generated SFX',
    status: 'architecturally-different',
    notes: ['GG currently uses procedural adaptive music rather than source-faithful module playback.', 'The original tracker modules are recoverable enough to support a faithful optional soundtrack mode.'],
  },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(dirPath, extensions) {
  return fs.readdirSync(dirPath)
    .filter((entry) => extensions.some((extension) => entry.toLowerCase().endsWith(extension.toLowerCase())))
    .sort((a, b) => a.localeCompare(b));
}

function trimCString(buffer, start, length) {
  return buffer.subarray(start, start + length).toString('latin1').replace(/\0+$/g, '').trim();
}

function parsePng(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`Invalid PNG signature for ${filePath}`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const compressionMethod = buffer[26];
  const filterMethod = buffer[27];
  const interlaceMethod = buffer[28];
  const colorTypeMap = {
    0: 'grayscale',
    2: 'rgb',
    3: 'indexed',
    4: 'grayscale-alpha',
    6: 'rgba',
  };
  return {
    width,
    height,
    bitDepth,
    colorType,
    colorModel: colorTypeMap[colorType] ?? `unknown-${colorType}`,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    interlaced: interlaceMethod === 1,
  };
}

function parseWav(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error(`Invalid WAV header for ${filePath}`);
  }

  let offset = 12;
  let fmt = null;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(dataOffset),
        channels: buffer.readUInt16LE(dataOffset + 2),
        sampleRate: buffer.readUInt32LE(dataOffset + 4),
        byteRate: buffer.readUInt32LE(dataOffset + 8),
        blockAlign: buffer.readUInt16LE(dataOffset + 12),
        bitsPerSample: buffer.readUInt16LE(dataOffset + 14),
      };
    } else if (id === 'data') {
      dataSize = size;
    }
    offset = dataOffset + size + (size % 2);
  }

  if (!fmt) {
    throw new Error(`Missing fmt chunk in ${filePath}`);
  }

  const durationSeconds = fmt.byteRate > 0 ? dataSize / fmt.byteRate : 0;
  return {
    ...fmt,
    dataSize,
    durationSeconds: Number(durationSeconds.toFixed(3)),
  };
}

function formatItNote(noteValue) {
  if (noteValue < 1 || noteValue > 120) {
    return null;
  }
  const names = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  const zeroBased = noteValue - 1;
  const octave = Math.floor(zeroBased / 12);
  const noteName = names[zeroBased % 12];
  return `${noteName}${octave}`;
}

function formatEffectLetter(effect) {
  if (!effect || effect < 1 || effect > 26) {
    return null;
  }
  return String.fromCharCode(64 + effect);
}

function summarizeHistogram(histogram) {
  return Object.entries(histogram)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([key, count]) => ({ key, count }));
}

function parseItPattern(buffer, offset, index) {
  if (!offset) {
    return {
      index,
      rows: 64,
      packedLength: 0,
      isEmpty: true,
      rowEventCounts: [],
      events: [],
      summary: {
        totalEvents: 0,
        channelsUsed: [],
        noteHistogramTop: [],
        effectHistogramTop: [],
        instrumentHistogramTop: [],
      },
    };
  }

  const packedLength = buffer.readUInt16LE(offset);
  const rows = buffer.readUInt16LE(offset + 2);
  const start = offset + 8;
  const end = start + packedLength;
  const channelMasks = new Array(64).fill(0);
  const channelState = Array.from({ length: 64 }, () => ({}));
  const events = [];
  const rowEventCounts = new Array(rows).fill(0);
  const noteHistogram = {};
  const effectHistogram = {};
  const instrumentHistogram = {};
  const channelsUsed = new Set();

  let position = start;
  let row = 0;
  while (row < rows && position < end) {
    const channelToken = buffer[position++];
    if (channelToken === 0) {
      row += 1;
      continue;
    }

    const channel = (channelToken - 1) & 63;
    let mask = channelMasks[channel];
    if (channelToken & 0x80) {
      mask = buffer[position++];
      channelMasks[channel] = mask;
    }

    const state = channelState[channel];
    const event = { row, channel };
    let hasContent = false;

    if (mask & 0x01) {
      event.noteValue = buffer[position++];
      state.noteValue = event.noteValue;
      hasContent = true;
    }
    if (mask & 0x02) {
      event.instrument = buffer[position++];
      state.instrument = event.instrument;
      hasContent = true;
    }
    if (mask & 0x04) {
      event.volume = buffer[position++];
      state.volume = event.volume;
      hasContent = true;
    }
    if (mask & 0x08) {
      event.effect = buffer[position++];
      event.effectParam = buffer[position++];
      state.effect = event.effect;
      state.effectParam = event.effectParam;
      hasContent = true;
    }
    if ((mask & 0x10) && state.noteValue !== undefined) {
      event.noteValue = state.noteValue;
      hasContent = true;
    }
    if ((mask & 0x20) && state.instrument !== undefined) {
      event.instrument = state.instrument;
      hasContent = true;
    }
    if ((mask & 0x40) && state.volume !== undefined) {
      event.volume = state.volume;
      hasContent = true;
    }
    if ((mask & 0x80) && state.effect !== undefined) {
      event.effect = state.effect;
      event.effectParam = state.effectParam;
      hasContent = true;
    }

    if (!hasContent) {
      continue;
    }

    const note = formatItNote(event.noteValue);
    if (note) {
      event.note = note;
      noteHistogram[note] = (noteHistogram[note] ?? 0) + 1;
    }

    const effectLetter = formatEffectLetter(event.effect);
    if (effectLetter) {
      event.effectLetter = effectLetter;
      effectHistogram[effectLetter] = (effectHistogram[effectLetter] ?? 0) + 1;
    }

    if (event.instrument) {
      instrumentHistogram[String(event.instrument)] = (instrumentHistogram[String(event.instrument)] ?? 0) + 1;
    }

    channelsUsed.add(channel);
    rowEventCounts[row] += 1;
    events.push(event);
  }

  return {
    index,
    rows,
    packedLength,
    isEmpty: false,
    rowEventCounts,
    events,
    summary: {
      totalEvents: events.length,
      channelsUsed: Array.from(channelsUsed).sort((left, right) => left - right),
      noteHistogramTop: summarizeHistogram(noteHistogram),
      effectHistogramTop: summarizeHistogram(effectHistogram),
      instrumentHistogramTop: summarizeHistogram(instrumentHistogram),
    },
  };
}

function parseIt(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (trimCString(buffer, 0, 4) !== 'IMPM') {
    throw new Error(`Invalid IT header for ${filePath}`);
  }

  const ordNum = buffer.readUInt16LE(32);
  const insNum = buffer.readUInt16LE(34);
  const smpNum = buffer.readUInt16LE(36);
  const patNum = buffer.readUInt16LE(38);
  const createdWith = buffer.readUInt16LE(40);
  const compatibleWith = buffer.readUInt16LE(42);
  const flags = buffer.readUInt16LE(44);
  const special = buffer.readUInt16LE(46);
  const globalVolume = buffer[48];
  const mixVolume = buffer[49];
  const initialSpeed = buffer[50];
  const initialTempo = buffer[51];
  const stereoSeparation = buffer[52];
  const pitchWheelDepth = buffer[53];
  const messageLength = buffer.readUInt16LE(54);
  const messageOffset = buffer.readUInt32LE(56);
  const ordersOffset = 192;
  const orders = Array.from(buffer.subarray(ordersOffset, ordersOffset + ordNum));
  const parapointerOffset = ordersOffset + ordNum;

  const instrumentPointers = [];
  for (let index = 0; index < insNum; index += 1) {
    instrumentPointers.push(buffer.readUInt32LE(parapointerOffset + index * 4));
  }
  const samplePointersOffset = parapointerOffset + insNum * 4;
  const samplePointers = [];
  for (let index = 0; index < smpNum; index += 1) {
    samplePointers.push(buffer.readUInt32LE(samplePointersOffset + index * 4));
  }
  const patternPointersOffset = samplePointersOffset + smpNum * 4;
  const patternPointers = [];
  for (let index = 0; index < patNum; index += 1) {
    patternPointers.push(buffer.readUInt32LE(patternPointersOffset + index * 4));
  }

  const message = messageLength > 0 && messageOffset > 0
    ? trimCString(buffer, messageOffset, messageLength)
    : '';

  const samples = samplePointers.map((pointer, index) => {
    if (!pointer) {
      return { index: index + 1, pointer: 0, missing: true };
    }
    return {
      index: index + 1,
      pointer,
      dosFilename: trimCString(buffer, pointer + 4, 12),
      globalVolume: buffer[pointer + 17],
      flags: buffer[pointer + 18],
      defaultVolume: buffer[pointer + 19],
      sampleName: trimCString(buffer, pointer + 20, 26),
      convertFlags: buffer[pointer + 46],
      defaultPan: buffer[pointer + 47],
      length: buffer.readUInt32LE(pointer + 48),
      loopBegin: buffer.readUInt32LE(pointer + 52),
      loopEnd: buffer.readUInt32LE(pointer + 56),
      c5Speed: buffer.readUInt32LE(pointer + 60),
      sustainLoopBegin: buffer.readUInt32LE(pointer + 64),
      sustainLoopEnd: buffer.readUInt32LE(pointer + 68),
      sampleDataPointer: buffer.readUInt32LE(pointer + 72),
    };
  });

  const instruments = instrumentPointers.map((pointer, index) => {
    if (!pointer) {
      return { index: index + 1, pointer: 0, missing: true };
    }
    return {
      index: index + 1,
      pointer,
      dosFilename: trimCString(buffer, pointer + 4, 12),
      instrumentName: trimCString(buffer, pointer + 32, 26),
    };
  });

  const patterns = patternPointers.map((pointer, index) => parseItPattern(buffer, pointer, index));
  const noteHistogram = {};
  const effectHistogram = {};
  const instrumentHistogram = {};
  const channelsUsed = new Set();
  let totalEvents = 0;
  for (const pattern of patterns) {
    totalEvents += pattern.events.length;
    for (const event of pattern.events) {
      channelsUsed.add(event.channel);
      if (event.note) {
        noteHistogram[event.note] = (noteHistogram[event.note] ?? 0) + 1;
      }
      if (event.effectLetter) {
        effectHistogram[event.effectLetter] = (effectHistogram[event.effectLetter] ?? 0) + 1;
      }
      if (event.instrument) {
        instrumentHistogram[String(event.instrument)] = (instrumentHistogram[String(event.instrument)] ?? 0) + 1;
      }
    }
  }

  return {
    file: path.basename(filePath),
    path: path.relative(repoRoot, filePath),
    title: trimCString(buffer, 4, 26),
    header: {
      ordNum,
      insNum,
      smpNum,
      patNum,
      createdWith,
      compatibleWith,
      flags,
      special,
      globalVolume,
      mixVolume,
      initialSpeed,
      initialTempo,
      stereoSeparation,
      pitchWheelDepth,
      messageLength,
      messageOffset,
    },
    orders,
    message,
    tracksUsedAs: MUSIC_TRACK_USAGE.find((track) => track.file === path.basename(filePath))?.role ?? null,
    oldRevision: MUSIC_TRACK_USAGE.find((track) => track.file === path.basename(filePath))?.oldRevision ?? null,
    samples,
    instruments,
    patterns,
    summary: {
      totalEvents,
      channelsUsed: Array.from(channelsUsed).sort((left, right) => left - right),
      noteHistogramTop: summarizeHistogram(noteHistogram),
      effectHistogramTop: summarizeHistogram(effectHistogram),
      instrumentHistogramTop: summarizeHistogram(instrumentHistogram),
      nonEmptyPatterns: patterns.filter((pattern) => !pattern.isEmpty).length,
    },
  };
}

function parseCredits(readmeText) {
  const lines = readmeText.split(/\r?\n/);
  const thanksIndex = lines.findIndex((line) => line.startsWith('Thanks:'));
  if (thanksIndex === -1) {
    return [];
  }
  const credits = [];
  for (let index = thanksIndex + 2; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      if (credits.length > 0) {
        break;
      }
      continue;
    }
    if (!line.includes('-')) {
      continue;
    }
    const [name, detail] = line.split(/\s*-\s*/, 2);
    credits.push({
      name: name.trim(),
      detail: detail.trim(),
    });
  }
  return credits;
}

function parseGfxCases(imagesText) {
  const lines = imagesText.split(/\r?\n/);
  const gfxSets = {};
  let currentSet = null;
  for (const line of lines) {
    const caseMatch = line.match(/Case\s+\d+\s*'?\s*([a-zA-Z0-9_]+)/);
    if (caseMatch) {
      currentSet = caseMatch[1].toLowerCase();
      if (!gfxSets[currentSet]) {
        gfxSets[currentSet] = { atlases: {}, sprites: [] };
      }
      continue;
    }

    if (!currentSet) {
      continue;
    }

    const animMatch = line.match(/(\w+):TImage\s*=\s*LoadAnimImage\(path\$\+"([^"]+)",\s*(\d+),\s*(\d+),\s*0,\s*(\d+)\)/i);
    if (animMatch) {
      const [, variable, file, frameWidth, frameHeight, frameCount] = animMatch;
      gfxSets[currentSet].atlases[variable] = {
        file,
        frameWidth: Number(frameWidth),
        frameHeight: Number(frameHeight),
        frameCount: Number(frameCount),
      };
      continue;
    }

    const imageMatch = line.match(/(\w+):Timage\s*=\s*LoadImage\(path\$\+"([^"]+)"\)/i) || line.match(/(\w+):TImage\s*=\s*LoadImage\(path\$\+"([^"]+)"\)/i);
    if (imageMatch) {
      const [, variable, file] = imageMatch;
      gfxSets[currentSet].sprites.push({ variable, file });
    }
  }
  return gfxSets;
}

function buildGraphicsManifest(imagesText) {
  const gfxRoot = path.join(gridWarsRoot, 'gfx');
  const tiers = {};
  for (const tier of fs.readdirSync(gfxRoot).sort((left, right) => left.localeCompare(right))) {
    const tierPath = path.join(gfxRoot, tier);
    if (!fs.statSync(tierPath).isDirectory()) {
      continue;
    }
    const files = listFiles(tierPath, ['.png']);
    tiers[tier] = files.map((file) => {
      const metadata = parsePng(path.join(tierPath, file));
      return {
        file,
        path: path.relative(repoRoot, path.join(tierPath, file)),
        ...metadata,
      };
    });
  }

  const logicalAssets = ENEMY_SEMANTICS.map((entry) => {
    const variants = {};
    for (const [tier, files] of Object.entries(tiers)) {
      const match = files.find((file) => file.file.toLowerCase() === `${entry.assetId}.png`);
      if (match) {
        variants[tier] = {
          width: match.width,
          height: match.height,
          colorModel: match.colorModel,
          interlaced: match.interlaced,
        };
      }
    }
    return {
      ...entry,
      variants,
    };
  });

  const colourPick = parsePng(path.join(gfxRoot, 'colourpick.PNG'));

  return {
    sourceRef: GRIDWARS_REFS.images,
    gfxSets: parseGfxCases(imagesText),
    tiers,
    logicalAssets,
    colourPick: {
      file: 'colourpick.PNG',
      path: path.relative(repoRoot, path.join(gfxRoot, 'colourpick.PNG')),
      ...colourPick,
      frameWidth: 122,
      frameHeight: 9,
      frameCount: 3,
    },
  };
}

function buildSoundManifest() {
  const soundsRoot = path.join(gridWarsRoot, 'sounds');
  const wavFiles = listFiles(soundsRoot, ['.wav']);
  const files = wavFiles.map((file) => ({
    file,
    path: path.relative(repoRoot, path.join(soundsRoot, file)),
    ...parseWav(path.join(soundsRoot, file)),
  }));

  const usedFiles = new Set(SOUND_BINDINGS.map((binding) => binding.file.toLowerCase()));
  const unusedFiles = files.filter((file) => !usedFiles.has(file.file.toLowerCase())).map((file) => file.file);
  const missingFiles = SOUND_BINDINGS
    .filter((binding) => !files.some((file) => file.file.toLowerCase() === binding.file.toLowerCase()))
    .map((binding) => binding.file);

  return {
    sourceRef: GRIDWARS_REFS.sounds,
    files,
    bindings: SOUND_BINDINGS,
    unusedFiles,
    missingFiles,
  };
}

function buildMusicManifest() {
  const musicRoot = path.join(gridWarsRoot, 'music');
  const modules = listFiles(musicRoot, ['.it']).map((file) => parseIt(path.join(musicRoot, file)));
  const hasOggFallbacks = fs.existsSync(musicRoot)
    ? fs.readdirSync(musicRoot).some((file) => file.toLowerCase().endsWith('.ogg'))
    : false;
  return {
    sourceRef: GRIDWARS_REFS.music,
    windowsPlayback: 'BASS_MusicLoad on .it modules',
    macFallbackCommentedOut: true,
    macExpectedFormat: '.ogg',
    hasOggFallbacks,
    modules,
    trackUsage: MUSIC_TRACK_USAGE,
  };
}

function buildAlignmentManifest() {
  return {
    gridWarsRefs: GRIDWARS_REFS,
    geometryGenocideRefs: GG_REFS,
    rosterAlignment: GG_ALIGNMENT,
    recommendations: [
      'Re-enable Triangle first because the source file already exists in Death by Geometry and the Grid Wars asset/SFX identity is clear.',
      'Promote Circle back into active spawn pools to restore the Seeker family as an independent threat.',
      'Add Snake and Interceptor as next-priority source-faithful families because the original archive includes both dedicated art and audio cues.',
      'Offer an optional Grid Wars soundtrack mode using the recovered tracker modules or offline renders derived from them.',
      'Preserve procedural/adaptive music as a separate mode rather than replacing it outright.',
    ],
  };
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function renderReadme(assetManifest, soundManifest, musicManifest, alignmentManifest, credits) {
  const activeMissingRoster = alignmentManifest.rosterAlignment
    .filter((entry) => ['missing', 'unwired', 'needs-reenable', 'source-present-unwired'].includes(entry.status))
    .map((entry) => `- ${entry.gridWarsConcept}: ${entry.notes[0]}`)
    .join('\n');

  const musicSummary = musicManifest.modules
    .map((module) => `- \`${module.file}\`: title "${module.title}", ${module.header.ordNum} orders, ${module.header.smpNum} samples, ${module.header.patNum} patterns, role ${module.tracksUsedAs ?? 'unknown'}`)
    .join('\n');

  const creditLines = credits.map((credit) => `- ${credit.name}: ${credit.detail}`).join('\n');

  return `# GridWars54 Analysis

Generated by \`scripts/extract-gridwars54-analysis.mjs\`.

## What is here

- \`gridwars54-asset-manifest.json\`: PNG/WAV inventory with decoded metadata, sprite semantics, powerup mapping, and source bindings.
- \`gridwars54-music-manifest.json\`: parsed Impulse Tracker module headers, samples, instruments, pattern rows, and event summaries.
- \`gridwars54-alignment.json\`: practical mapping between original Grid Wars concepts and the current Death by Geometry roster/audio model.
- \`geometry-genocide-gridwars-alignment.md\`: human-oriented rewrite/port guidance.

## Inventory summary

- Graphics tiers: ${Object.keys(assetManifest.tiers).length} (\`${Object.keys(assetManifest.tiers).join('`, `')}\`)
- PNG assets discovered: ${Object.values(assetManifest.tiers).reduce((sum, tier) => sum + tier.length, 0) + 1}
- Logical sprite families mapped: ${assetManifest.logicalAssets.length}
- WAV files discovered: ${soundManifest.files.length}
- Music modules discovered: ${musicManifest.modules.length}

## Source credits

${creditLines}

## Music recovery status

The original soundtrack is stored as Impulse Tracker modules, not flattened audio. That means composition-level recovery is feasible.

${musicSummary}

## Highest-value alignment gaps

${activeMissingRoster}

## Notes

- The original Windows build plays \`.it\` files directly through BASS; the commented-out Mac path expects \`.ogg\` files that are not present.
- \`shieldwarning.wav\` is referenced in source but missing from the archive.
- \`click.wav\` and \`pop1.wav\` are present in the archive but not bound in the examined source.
`;
}

function main() {
  ensureDir(outputRoot);

  const readmeText = readText(path.join(gridWarsRoot, 'Readme.txt'));
  const imagesText = readText(path.join(gridWarsRoot, 'images.bmx'));

  const credits = parseCredits(readmeText);
  const assetManifest = {
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(repoRoot, gridWarsRoot),
    credits,
    graphics: buildGraphicsManifest(imagesText),
    powerups: {
      sourceRef: GRIDWARS_REFS.powerups,
      entries: POWERUP_SEMANTICS,
    },
    sounds: buildSoundManifest(),
  };
  const musicManifest = {
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(repoRoot, gridWarsRoot),
    music: buildMusicManifest(),
  };
  const alignmentManifest = {
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(repoRoot, gridWarsRoot),
    alignment: buildAlignmentManifest(),
  };

  writeJson(path.join(outputRoot, 'gridwars54-asset-manifest.json'), assetManifest);
  writeJson(path.join(outputRoot, 'gridwars54-music-manifest.json'), musicManifest);
  writeJson(path.join(outputRoot, 'gridwars54-alignment.json'), alignmentManifest);

  const readme = renderReadme(assetManifest.graphics, assetManifest.sounds, musicManifest.music, alignmentManifest.alignment, credits);
  fs.writeFileSync(path.join(outputRoot, 'README.md'), readme);

  console.log(`Wrote analysis files to ${path.relative(repoRoot, outputRoot)}`);
}

main();
