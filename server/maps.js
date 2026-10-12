 // Kumpulan map labirin 10x10 tetap (fixed map pool), gaya arcade retro & berliku
// Semua map sudah divalidasi: seluruh 100 sel terjangkau (no isolated area)
const MAP_POOL = [
  {
    name: "Map 1",
    horizontalWalls: [
      [false,false,false,true,false,true,false,false,false],
      [false,true,true,false,true,false,true,true,false],
      [false,true,false,true,false,true,false,true,false],
      [true,false,true,true,true,true,true,false,true],
      [false,false,true,true,false,true,true,false,false],
      [false,true,true,false,false,false,true,true,false],
      [false,true,false,false,true,false,false,true,false],
      [false,true,false,true,true,true,false,true,false],
      [true,false,true,false,true,false,true,false,true],
      [false,false,false,true,false,true,false,false,false]
    ],
    verticalWalls: [
      [true,false,false,false,false,false,false,false,false,true],
      [false,true,true,true,false,false,true,true,true,false],
      [false,false,false,false,false,false,false,false,false,false],
      [false,false,true,false,true,true,false,true,false,false],
      [false,true,false,false,false,false,false,false,true,false],
      [true,false,false,true,true,true,true,false,false,true],
      [false,true,true,true,false,false,true,true,true,false],
      [false,false,false,false,true,true,false,false,false,false],
      [false,true,true,false,false,false,false,true,true,false]
    ]
  },
  {
    name: "Map 2",
    horizontalWalls: [
      [true,false,true,false,true,false,true,false,true],
      [false,true,false,true,false,true,false,true,false],
      [false,false,true,false,true,false,true,false,false],
      [false,true,false,true,false,true,false,true,false],
      [true,false,true,false,true,false,true,false,true],
      [false,true,false,true,false,true,false,true,false],
      [true,false,false,false,true,false,false,false,true],
      [false,true,false,false,false,false,false,true,false],
      [false,false,false,true,false,true,false,false,false],
      [false,false,false,false,true,false,false,false,false]
    ],
    verticalWalls: [
      [false,false,false,false,false,false,false,false,false,false],
      [false,true,true,false,true,true,false,true,true,false],
      [true,false,false,false,true,true,false,false,false,true],
      [false,true,false,true,false,false,true,false,true,false],
      [false,true,true,false,true,true,false,true,true,false],
      [false,false,false,true,false,false,true,false,false,false],
      [false,true,false,false,true,true,false,false,true,false],
      [true,false,true,true,false,false,true,true,false,true],
      [false,true,false,false,false,false,false,false,true,false]
    ]
  },
  {
    name: "Map 3",
    horizontalWalls: [
      [false,true,false,false,true,false,false,true,false],
      [false,false,true,false,true,false,true,false,false],
      [true,false,true,true,false,true,true,false,true],
      [false,true,false,false,true,false,false,true,false],
      [false,false,false,true,false,true,false,false,false],
      [true,false,true,false,false,false,true,false,true],
      [false,true,false,false,true,false,false,true,false],
      [true,false,true,false,true,false,true,false,true],
      [false,true,false,true,false,true,false,true,false],
      [false,false,false,false,true,false,false,false,false]
    ],
    verticalWalls: [
      [true,false,true,false,true,true,false,true,false,true],
      [false,true,false,false,false,false,false,false,true,false],
      [false,false,true,false,true,true,false,true,false,false],
      [false,true,true,false,false,false,false,true,true,false],
      [false,false,false,true,true,true,true,false,false,false],
      [false,true,true,true,false,false,true,true,true,false],
      [false,true,false,false,true,true,false,false,true,false],
      [false,false,true,true,false,false,true,true,false,false],
      [false,true,false,false,true,true,false,false,true,false]
    ]
  },
  {
    name: "Map 4",
    horizontalWalls: [
      [false,true,false,false,false,false,false,true,false],
      [true,false,true,true,false,true,true,false,true],
      [false,true,false,true,false,true,false,true,false],
      [false,false,true,false,false,false,true,false,false],
      [false,true,false,true,false,true,false,true,false],
      [false,true,true,false,true,false,true,true,false],
      [false,false,true,false,true,false,true,false,false],
      [true,false,true,false,false,false,true,false,true],
      [true,true,true,false,true,false,true,true,true],
      [true,false,false,false,false,false,false,false,true]
    ],
    verticalWalls: [
      [true,false,true,false,false,false,false,true,false,true],
      [false,true,false,true,false,false,true,false,true,false],
      [false,false,true,false,false,false,false,true,false,false],
      [false,true,false,false,true,true,false,false,true,false],
      [true,false,false,true,false,false,true,false,false,true],
      [false,true,true,false,true,true,false,true,true,false],
      [false,true,false,true,false,false,true,false,true,false],
      [false,false,false,false,true,true,false,false,false,false],
      [false,false,true,true,false,false,true,true,false,false]
    ]
  }
];

module.exports = MAP_POOL;
