function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function _iterableToArrayLimit(arr, i) { var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"]; if (_i == null) return; var _arr = []; var _n = true; var _d = false; var _s, _e; try { for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }

(function () {
  // River tile IDs for each direction
  var RIVER_SVC = [5, 6, 7, 8, 11, 12, 14]; // South, Vertical, Cross

  var RIVER_EHC = [4, 6, 7, 10, 11, 13, 14]; // East, Horizontal, Cross

  var RIVER_WHC = [4, 6, 8, 9, 11, 12, 13]; // West, Horizontal, Cross

  var RIVER_NVC = [5, 6, 9, 10, 12, 13, 14]; // North, Vertical, Cross

  /* Canvas based map rendering
   * @class
   */

  var MapRenderer = /*#__PURE__*/function () {
    "use strict";

    /* MapRenderer constructor
     * @param {object} terrainInfo - 2d array/integer keyed object with objects containing terrain_id, [x][y] indexed
     * @param {number} width - number of tiles on X axis
     * @param {number} height - number of tiles on Y axis
     * @param {object} buildings - 2d array/integer keyed object with objects containing terrain_id, [x][y] indexed, for building shadows
     * @param {number} mapTheme - map themes id
     * @param {string} terrainPath - path to tileset, 'terrain/aw1/'
     * @param {string} weather - weather name
     * @param {string} shoals - classic or new shoals
     */
    function MapRenderer(terrainInfo, width, height) {
      var _ref = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {},
          _ref$buildings = _ref.buildings,
          buildings = _ref$buildings === void 0 ? {} : _ref$buildings,
          _ref$mapTheme = _ref.mapTheme,
          mapTheme = _ref$mapTheme === void 0 ? 2 : _ref$mapTheme,
          _ref$terrainPath = _ref.terrainPath,
          terrainPath = _ref$terrainPath === void 0 ? "terrain/aw1/" : _ref$terrainPath,
          _ref$weather = _ref.weather,
          weather = _ref$weather === void 0 ? "clear" : _ref$weather,
          _ref$shoals = _ref.shoals,
          shoals = _ref$shoals === void 0 ? "new" : _ref$shoals;

      _classCallCheck(this, MapRenderer);

      this._terrainInfo = terrainInfo || {};
      this._buildings = buildings || {};
      this._width = width;
      this._height = height;
      this._weather = weather;
      this._newShoals = shoals === "new";
      this._spriteSheet = null; // 1d array of tiles

      this._tiles = new Array(width * height);
      this._shadowTiles = new Array(width * height); // If true, rebuild _tiles array on render or when calling _cacheTiles

      this._tilesDirty = true; // Map from tile name to sprite coords for current theme/weather

      this._tileMap = null;
      this._shadowMap = null;
      this._renderCanvas = this._renderCanvas.bind(this);
      this.getSpriteSheet();
      this.setTheme({
        terrainPath: terrainPath,
        mapTheme: mapTheme
      });
    }

    _createClass(MapRenderer, [{
      key: "setWeather",
      value: function setWeather(weather) {
        this._weather = weather;

        this._updateTilemap();

        this.render();
        return this;
      }
    }, {
      key: "setWidth",
      value: function setWidth(width) {
        this.setSize(width, this._height);
        return this;
      }
    }, {
      key: "setHeight",
      value: function setHeight(height) {
        this.setSize(this._width, height);
        return this;
      }
    }, {
      key: "setSize",
      value: function setSize(width, height) {
        this._tilesDirty = true;
        this._width = width;
        this._height = height;
        this._tiles = new Array(width * height);
        this._shadowTiles = new Array(width * height);

        if (this._canvas) {
          this._canvas.width = width * 16;
          this._canvas.height = height * 16;
        }

        return this;
      }
    }, {
      key: "setTheme",
      value: function setTheme() {
        var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            _ref2$terrainPath = _ref2.terrainPath,
            terrainPath = _ref2$terrainPath === void 0 ? this._terrainPath : _ref2$terrainPath,
            _ref2$mapTheme = _ref2.mapTheme,
            mapTheme = _ref2$mapTheme === void 0 ? this._mapTheme : _ref2$mapTheme;

        if (terrainPath && mapTheme !== undefined) {
          this._terrainPath = terrainPath;

          if (mapTheme == 1) {
            mapTheme = 2;
          }

          if (!TS_themeIdToName[mapTheme]) {
            mapTheme = 2;
          }

          this._mapTheme = mapTheme;

          this._updateTilemap();
        } else {
          throw new Error("setTheme requires terrainPath and mapTheme");
        }

        this.render();
        return this;
      }
    }, {
      key: "setShoalDisplay",
      value: function setShoalDisplay() {
        var shoals = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : "new";
        this._newShoals = shoals === "new";
        this._tilesDirty = true;
        this.render();
        return this;
      }
    }, {
      key: "setTerrainInfo",
      value: function setTerrainInfo(terrainInfo) {
        this._terrainInfo = terrainInfo;
        this._tilesDirty = true;
        return this;
      } // used by map editor, updates surrounding tiles (sea,shoal)

    }, {
      key: "setTile",
      value: function setTile(x, y, tileId) {
        this._terrainInfo[x][y].terrain_id = tileId;

        for (var bx = Math.max(0, x - 1); bx <= Math.min(this._width - 1, x + 1); bx++) {
          for (var by = Math.max(0, y - 1); by <= Math.min(this._height - 1, y + 1); by++) {
            var name = this.getTileName(bx, by);
            this._tiles[bx + by * this._width] = this._tileMap[name];
          }
        }

        this._shadowTiles[x + y * this._width] = this._shadowMap[TS_terrainIdToName[tileId]];
        return this;
      }
    }, {
      key: "_updateTilemap",
      value: function _updateTilemap() {
        var themeName = TS_themeIdToName[this._mapTheme];

        if (this._mapTheme == 2) {
          this._tileMap = TS_tileSets[this._terrainPath][this._weather];
          this._shadowMap = TS_tileShadows[this._terrainPath];
        } else if (TS_mapThemes[themeName]) {
          var theme = TS_mapThemes[themeName].terrain;
          this._tileMap = Object.assign({}, TS_tileSets[this._terrainPath][this._weather], TS_tileSets[theme][this._weather]);
          this._shadowMap = Object.assign({}, TS_tileShadows[this._terrainPath], TS_tileShadows[theme]);
        } else {
          throw new Error("Invalid map theme ".concat(this._mapTheme));
        }

        this._tilesDirty = true;

        this._cacheTiles();
      }
    }, {
      key: "initCanvas",
      value: function initCanvas(canvasEl) {
        var canvas;

        if (canvasEl) {
          if (typeof canvasEl === "string") {
            canvas = document.querySelector(canvasEl);
          } else {
            canvas = canvasEl;
          }
        } else {
          throw new Error("initCanvas requires canvas element");
        }

        canvas.width = this._width * 16;
        canvas.height = this._height * 16;
        this._canvas = canvas;
        this._context2d = canvas.getContext("2d", {
          alpha: false,
          antialias: false
        });
        this._context2d.imageSmoothingEnabled = false;
        this._animFrame = requestAnimationFrame(this._renderCanvas);
        return this;
      }
    }, {
      key: "getSpriteSheet",
      value: function getSpriteSheet() {
        var _this = this;

        if (this._promiseSpriteSheet) {
          return this._promiseSpriteSheet;
        }

        return this._promiseSpriteSheet = new Promise(function (resolve, reject) {
          var img = new Image();
          img.src = TS_spriteSheet;

          img.onload = function () {
            _this._spriteSheet = img;
            resolve(_this._spriteSheet);
          };

          img.onerror = function () {
            reject("Couldn't load sprite sheet.");
          };
        });
      }
    }, {
      key: "_cacheTiles",
      value: function _cacheTiles() {
        if (!this._tilesDirty) {
          return;
        }

        this._tilesDirty = false;

        for (var y = 0; y < this._height; y++) {
          for (var x = 0; x < this._width; x++) {
            var _this$_buildings$x;

            var name = this.getTileName(x, y);
            this._tiles[x + y * this._width] = this._tileMap[name];
            var building = (_this$_buildings$x = this._buildings[x]) === null || _this$_buildings$x === void 0 ? void 0 : _this$_buildings$x[y];

            if (building) {
              var id = building.terrain_id;
              this._shadowTiles[x + y * this._width] = this._shadowMap[TS_terrainIdToName[id]];
            } else {
              this._shadowTiles[x + y * this._width] = this._shadowMap[name];
            }
          }
        }
      }
    }, {
      key: "getTile",
      value: function getTile(x, y) {
        return this._tiles[x + y * this._width];
      }
    }, {
      key: "drawSprite",
      value: function drawSprite(sprite, x, y) {
        this._context2d.drawImage(this._spriteSheet, sprite.x, sprite.y, sprite.w, sprite.h, x, y, sprite.w, sprite.h);
      }
    }, {
      key: "_renderCanvas",
      value: function _renderCanvas() {
        this._cacheTiles();

        if (!this._spriteSheet) {
          this._animFrame = requestAnimationFrame(this._renderCanvas);
          return;
        }

        var plain = this._tileMap["plain"];

        for (var y = 0; y < this._height; y++) {
          for (var x = 0; x < this._width; x++) {
            this.drawSprite(plain, x * 16, y * 16);
            var sprite = this.getTile(x, y); // If a tile casts a shadow, draw it over shadows

            if (!sprite || this._shadowTiles[x + y * this._width]) continue;
            var offset = sprite.h - 16;
            this.drawSprite(sprite, x * 16, y * 16 - offset);
          }

          for (var _x = 0; _x < this._width; _x++) {
            var shadow = this._shadowTiles[_x + y * this._width];

            if (shadow) {
              this._context2d.globalAlpha = 0.16;
              this.drawSprite(shadow, _x * 16, y * 16);
              this._context2d.globalAlpha = 1;

              var _sprite = this.getTile(_x, y);

              if (!_sprite) continue;

              var _offset = _sprite.h - 16;

              this.drawSprite(_sprite, _x * 16, y * 16 - _offset);
            }
          }
        }

        if (this._weather === "rain" && this._mapTheme != 2) {
          //this._canvas.style.filter = 'hue-rotate(7deg) saturate(60%) brightness(1.05)';
          this._context2d.fillStyle = "rgba(0,40,150,0.1)";

          this._context2d.fillRect(0, 0, this._canvas.width, this._canvas.height); //this._canvas.style.filter = '';

        }
      }
    }, {
      key: "render",
      value: function render() {
        if (this._canvas) {
          cancelAnimationFrame(this._animFrame);
          this._animFrame = requestAnimationFrame(this._renderCanvas);
        }

        return this;
      }
      /* Draw a tile to a canvas, returns canvas element.
       * @param {string} name - tiles name 'plain' 'acidrainbase' etc.
       * @param {HTMLCanvasElement} [canvasEl] - optional canvas to draw on, creates new if undefined
       * @returns {HTMLCanvasElement}
       */

    }, {
      key: "drawTileImage",
      value: function drawTileImage(name, canvasEl) {
        if (!canvasEl) {
          canvasEl = document.createElement("canvas");
        }

        if (!this._spriteSheet) {
          return canvasEl;
        }

        if (name === "sea") {
          name += "0";
        }

        var plain = this._tileMap["plain"];
        var sprite = this._tileMap[name];
        canvasEl.width = sprite.w;
        canvasEl.height = sprite.h;
        var ctx = canvasEl.getContext("2d", {
          alpha: true,
          antialias: false
        });
        ctx.drawImage(this._spriteSheet, plain.x, plain.y, 16, 16, 0, sprite.h - 16, 16, 16);
        ctx.drawImage(this._spriteSheet, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, 16, sprite.h);
        return canvasEl;
      }
    }, {
      key: "getTileName",
      value: function getTileName(x, y) {
        var _this$_buildings$x4;

        if ((_this$_buildings$x4 = this._buildings[x]) !== null && _this$_buildings$x4 !== void 0 && _this$_buildings$x4[y]) {
          return undefined;
        }

        var _this$_terrainInfo$x, _this$_terrainInfo$x$;

        var tid = (_this$_terrainInfo$x = this._terrainInfo[x]) === null || _this$_terrainInfo$x === void 0 ? void 0 : (_this$_terrainInfo$x$ = _this$_terrainInfo$x[y]) === null || _this$_terrainInfo$x$ === void 0 ? void 0 : _this$_terrainInfo$x$.terrain_id;

        if (!tid) {
          return undefined;
        }

        var tile = this.getSea(tid, x, y) || this.getShoal(tid, x, y) || this.getMountain(tid, x, y) || TS_terrainIdToName[tid];
        return tile;
      }
    }, {
      key: "isBuilding",
      value: function isBuilding(id) {
        return id >= 34 && id <= 100 || id >= 111 && id <= 114 || id >= 117 && id <= 194 || id >= 196;
      }
    }, {
      key: "getMountain",
      value: function getMountain(tid, x, y) {
        if (tid === 2) {
          var _this$_buildings$x2, _this$_buildings$x3, _this$_terrainInfo$x2;

          var up = (_this$_buildings$x2 = this._buildings[x]) === null || _this$_buildings$x2 === void 0 ? void 0 : (_this$_buildings$x3 = _this$_buildings$x2[y - 1]) === null || _this$_buildings$x3 === void 0 ? void 0 : _this$_buildings$x3.terrain_id;

          if (up || this.isBuilding((_this$_terrainInfo$x2 = this._terrainInfo[x][y - 1]) === null || _this$_terrainInfo$x2 === void 0 ? void 0 : _this$_terrainInfo$x2.terrain_id)) {
            return "minimountain";
          } else {
            return "mountain";
          }
        }

        return false;
      }
    }, {
      key: "getSea",
      value: function getSea(tid, x, y) {
        if (tid === 28) {
          var total = 0;
          var xl = x - 1,
              xr = x + 1,
              yt = y - 1,
              yb = y + 1;
          var border = [[xl, yt], // top left
          [x, yt], // top
          [xr, yt], // top right
          [xr, y], // right
          [xr, yb], // bottom right
          [x, yb], // bottom
          [xl, yb], // bottom left
          [xl, y] // left
          ];

          for (var k = 0; k <= 7; k++) {
            var _this$_terrainInfo$bx, _this$_buildings$bx;

            var _border$k = _slicedToArray(border[k], 2),
                bx = _border$k[0],
                by = _border$k[1],
                bTile = ((_this$_terrainInfo$bx = this._terrainInfo[bx]) === null || _this$_terrainInfo$bx === void 0 ? void 0 : _this$_terrainInfo$bx[by]) || ((_this$_buildings$bx = this._buildings[bx]) === null || _this$_buildings$bx === void 0 ? void 0 : _this$_buildings$bx[by]),
                id = (bTile === null || bTile === void 0 ? void 0 : bTile.terrain_id) || 32;

            if (id >= 26 && id <= 33 || id === 195) {
              // sea reef bridge shoal teleport
              continue;
            } else if (id >= 4 && id <= 14) {
              // rivers
              if (k === 1 && RIVER_SVC.includes(id)) {
                total |= 0x05;
              } else if (k === 3 && RIVER_WHC.includes(id)) {
                total |= 0x14;
              } else if (k === 5 && RIVER_NVC.includes(id)) {
                total |= 0x50;
              } else if (k === 7 && RIVER_EHC.includes(id)) {
                total |= 0x41;
              } else {
                total |= 1 << k;
              }
            } else {
              total |= 1 << k;
            }
          }

          total &= ~((total << 1 | total >> 1 | total >> 7) & 0x55);
          return "sea" + total;
        }

        return false;
      }
    }, {
      key: "getShoal",
      value: function getShoal(tid, x, y) {
        if (tid >= 29 && tid <= 32) {
          if (!this._newShoals) {
            var _tiles$_xl, _tiles$_xr, _tiles$x, _tiles$x2;

            var land = function land(t) {
              if (!t) {
                return true;
              } // building


              var id = t.terrain_id; // shoal reef sea river teleport bridge

              if (id >= 4 && id <= 14 || id >= 28 && id <= 33 || id === 26 || id === 27 || id === 195) {
                return false;
              }

              return true;
            };

            // classic shoals
            var _xl = Math.max(x - 1, 0),
                _xr = Math.min(x + 1, this._width - 1),
                yu = Math.max(y - 1, 0),
                yd = Math.min(y + 1, this._height - 1);

            var tiles = this._terrainInfo;
            var left = land((_tiles$_xl = tiles[_xl]) === null || _tiles$_xl === void 0 ? void 0 : _tiles$_xl[y]),
                right = land((_tiles$_xr = tiles[_xr]) === null || _tiles$_xr === void 0 ? void 0 : _tiles$_xr[y]),
                up = land((_tiles$x = tiles[x]) === null || _tiles$x === void 0 ? void 0 : _tiles$x[yu]),
                down = land((_tiles$x2 = tiles[x]) === null || _tiles$x2 === void 0 ? void 0 : _tiles$x2[yd]);
            var shoal;

            if (right && up) {
              shoal = "shoalsw";
            } else if (right && down) {
              shoal = "shoalwn";
            } else if (left && up) {
              shoal = "shoales";
            } else if (left && down) {
              shoal = "shoalne";
            } else {
              shoal = TS_terrainIdToName[tid];
            }

            return shoal;
          }

          var total = 0;
          var xl = x - 1,
              xr = x + 1,
              yt = y - 1,
              yb = y + 1;
          var border = [[x, yt], // top
          [xl, y], // left
          [xr, y], // right
          [x, yb] // bottom
          ];

          for (var k = 0; k <= 3; k++) {
            var _this$_terrainInfo$bx2;

            var _border$k2 = _slicedToArray(border[k], 2),
                bx = _border$k2[0],
                by = _border$k2[1],
                bTile = (_this$_terrainInfo$bx2 = this._terrainInfo[bx]) === null || _this$_terrainInfo$bx2 === void 0 ? void 0 : _this$_terrainInfo$bx2[by],
                id = (bTile === null || bTile === void 0 ? void 0 : bTile.terrain_id) || 0,
                tval = 2;

            if (!bTile) {
              if (bx < 0 || bx >= this._width || by < 0 || by >= this._height) {
                tval = 0;
              }
            } else if (id === 28 || id === 33) {
              // sea or reef
              tval = 0;
            } else if (id >= 4 && id <= 14) {
              // rivers
              tval = 2;

              if (k === 0 && RIVER_SVC.includes(id)) {
                tval = 1;
              } else if (k === 1 && RIVER_EHC.includes(id)) {
                tval = 1;
              } else if (k === 2 && RIVER_WHC.includes(id)) {
                tval = 1;
              } else if (k === 3 && RIVER_NVC.includes(id)) {
                tval = 1;
              }
            } else if (id === 26) {
              // hbridge
              if (k === 0 || k === 3) {
                tval = 1;
              }
            } else if (id === 27) {
              // vbridge
              if (k === 1 || k === 2) {
                tval = 1;
              }
            } else if (id >= 29 && id <= 32 || id === 195) {
              // shoal or tele
              tval = 1;
            }

            total += Math.pow(3, k) * tval;
          }

          return "shoal" + total;
        }

        return false;
      }
    }]);

    return MapRenderer;
  }();

  window.MapRenderer = MapRenderer;
})();