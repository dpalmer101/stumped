/** Made-up quotes from made-up people. Our own copy: no real quotes or real names. */
export const QUOTES: readonly (readonly [quote: string, by: string])[] = [
  ["Stumped? I prefer “briefly out of my ground”.", "Jimmy Stumps"],
  ["I tried to become a spin bowler, but I could never turn up on time.", "Wrong’un Ron"],
  ["Fielding at slip is easy. It’s the catching that’s hard.", "Butterfingers McGee"],
  ["My bat and I have a lot in common. We both live on the edge.", "Edgar Nick"],
  ["I don’t bowl many maidens, but when I do, nobody notices.", "Dot Ball Dorothy"],
  ["Cricket is a game of two halves. And tea.", "Victor Sponge"],
  ["I’m not out. I’m just between innings.", "Duck Dawson"],
  ["Life’s too short to leave the ball outside off stump.", "Cover Drive Clive"],
  ["The pitch was so flat it came with its own spirit level.", "Roller Rita"],
  ["I love the third umpire. Second opinions are my thing.", "Doctor Review"],
  ["They call me the nightwatchman because I keep checking the time.", "Nigel Nightwatch"],
  ["My average is fine. It’s my mean that worries people.", "Statto Stan"],
  ["Every bail I’ve ever met has been a bit off.", "Bailey Off"],
  ["Short leg? I prefer “compact fielder”.", "Silly Point Sally"],
  ["I don’t sledge. I just narrate loudly.", "Chatty Gully"],
  ["I hit a six so big it needed a passport.", "Lofty McHook"],
  ["I’m a fast bowler. Mostly I’m fast to lunch.", "Bouncer Bob"],
  ["Rain stopped play. Then it started again. Then I stopped caring.", "Covers Colin"],
  ["Tea interval: the only break where everyone scores.", "Lady Lemon Drizzle"],
  ["My run-up is so long it has its own postcode.", "Run-up Rupert"],
  ["I’m not a slow scorer. I’m building a legacy, one dot at a time.", "Block Blockley"],
  ["You miss every ball you leave. That’s the point.", "Leave-it Lionel"],
  ["The ball kept swinging. It must have heard the band.", "Swingin’ Sid"],
  ["I appeal for everything. The umpire says I’m very appealing.", "Howzat Harriet"],
  ["Batting at eleven teaches you patience. Mostly in the dressing room.", "Tailend Terry"],
  ["I never drop catches. I release them back into the wild.", "Fumbles McFumble"],
  ["Spinners don’t get dizzy. They just have a lot of turn.", "Flipper Twirlington"],
  ["Did I nick it? That’s between me and the edge.", "Feather Faraday"],
  ["I scored a duck once. Now I can’t stop quacking about it.", "Golden Gary"],
  [
    "Some say I’m a nervous starter. I’m just stuck in the nervous nineties at nought.",
    "Nervous Norman",
  ],
];

export const pickQuote = (random = Math.random): readonly [string, string] =>
  QUOTES[Math.floor(random() * QUOTES.length)] ?? ["Stumped? Never.", "Jimmy Stumps"];
