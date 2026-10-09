import TinyQueue from '../vendor/awbw-tinyqueue.cjs';

// Reviewed native AWBW functions, copied byte for byte between their function
// boundaries. Source URLs/hashes are in vendor/sources.json. Rendering is off;
// all bindings are this request's authenticated, visibility-filtered context.
export function createNativeRules(context,axios){
 const {gameId,GAME_FLAGS__KINDLE_SCOP,maxX,maxY,viewerPId,terrainInfo,buildingsInfo,unitsInfo,unitMap,playersInfo,moveCosts,gameWeather,fogInfo,genericUnits,baseDamageValues,grantedVisions} = context;
 let currentClick=null;
 const getViewerPId=()=>context.viewerPId;
function getMovementTiles(maxX, maxY, mType, mp, startTile, unitTeam, player) {
  var draw = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : true;
  var xv = [-1, 1, 0, 0];
  var yv = [0, 0, -1, 1];
  var nNodes = maxX * maxY;
  var visited = [];
  var dist = [];
  var previous = [];
  var mCost = [];

  for (var i = 0; i < nNodes; i++) {
    visited.push(false);
    dist.push(Infinity);
    previous.push(null);
    mCost.push(null);
  }

  var startNode = startTile.y * maxX + startTile.x;
  dist[startNode] = 0;
  var queue = new TinyQueue([], function (a, b) {
    // Sort by which tile is closet
    var distDelta = a.dist - b.dist;

    if (distDelta !== 0) {
      return distDelta;
    } // Equally close tiles should be prioritized by the least hidden files (i.e. ones you can be trapped one).


    var fogDelta = a.numTrapableTiles - b.numTrapableTiles;

    if (fogDelta !== 0) {
      return fogDelta;
    }

    return 0;
  }); //Verification object to not include a tile twice

  var verif = {};
  var initial = {
    index: startNode,
    dist: 0,
    x: startTile.x,
    y: startTile.y,
    numTrapableTiles: 0
  };
  queue.push(initial);
  var tilesToDraw = [initial];
  verif[startNode] = 0;

  while (queue.length != 0) {
    var current = queue.pop();
    var index = current.index;
    var minValue = current.dist;
    var x = current.x;
    var y = current.y;
    var numTrapableTiles = current.numTrapableTiles;
    visited[index] = true;
    delete verif[index];
    if (dist[index] < minValue) continue;

    for (var _i = 0; _i < 4; _i++) {
      var ax = x + xv[_i];
      var ay = y + yv[_i];
      var terrainCost = findTerrainCost(mType, ax, ay, unitTeam, player);
      var isTeleportTile = checkTeleportTile(ax, ay); //returns true if the tile is a teleport tile

      var isHiddenTile = fogInfo && fogInfo[ax] && fogInfo[ax][ay] < 1; // Increment numTrapableTiles if the cost isn't free and it's hidden.

      var aNumTrapableTiles = numTrapableTiles + (isHiddenTile && !isTeleportTile);
      if (ax < 0 || ay < 0 || ax >= maxX || ay >= maxY || !terrainCost && !isTeleportTile) continue;
      var nextNodeIndex = ay * maxX + ax;
      mCost[nextNodeIndex] = terrainCost;
      if (visited[nextNodeIndex] || previous[nextNodeIndex]) continue;

      if (terrainCost === "A" && !verif[nextNodeIndex]) {
        //Mark previous tile and skip to next iteration if attack is possible
        previous[nextNodeIndex] = index;
        verif[nextNodeIndex] = "A";
        continue;
      }

      var newDist = minValue + terrainCost;

      if (newDist < dist[nextNodeIndex] && newDist <= mp) {
        previous[nextNodeIndex] = index;
        dist[nextNodeIndex] = newDist;

        if (!verif[nextNodeIndex]) {
          queue.push({
            index: nextNodeIndex,
            dist: newDist,
            x: ax,
            y: ay,
            numTrapableTiles: aNumTrapableTiles
          });
          verif[nextNodeIndex] = newDist;

          if (!isTeleportTile) {
            //do not show teleport tiles as landing spots
            tilesToDraw.push({
              index: nextNodeIndex,
              x: ax,
              y: ay,
              borderWidth: "0 0 0 0 "
            });
          }
        } else {
          for (var node in queue) {
            if (queue[node].index == nextNodeIndex) queue[node].dist = newDist;
          }
        }
      }
    }
  } //mark teleport tiles with infinite distance to prevent being landing spots


  dist.forEach(function (i, tile) {
    var _terrainInfo$tileX, _terrainInfo$tileX$ti;

    var tileX = tile % maxX;
    var tileY = (tile - tileX) / maxX;

    if (((_terrainInfo$tileX = terrainInfo[tileX]) === null || _terrainInfo$tileX === void 0 ? void 0 : (_terrainInfo$tileX$ti = _terrainInfo$tileX[tileY]) === null || _terrainInfo$tileX$ti === void 0 ? void 0 : _terrainInfo$tileX$ti.terrain_id) == 195) {
      dist[tile] = Infinity;
    }
  });
  var movementInfo = {
    dist: dist,
    previous: previous,
    mCost: mCost,
    mp: mp,
    tilesToDraw: tilesToDraw
  };
  var unitsInRange = []; //Object to prevent duplicates

  var unitsInRangeVerif = {};
  var minRange;
  var unitX;
  var unitY;

  if (currentClick && currentClick.info) {
    minRange = currentClick.info.units_short_range;
    unitX = currentClick.info.units_x;
    unitY = currentClick.info.units_y;
  }

  tilesToDraw.forEach(function (tile) {
    tile.borderWidth = findBorders(tile.index, dist);
    if (tile.borderWidth === "0 0 0 0 ") return;
    var newInRange = []; //Find units in range of attacker's extremities movement tiles

    if (minRange <= 1) {
      newInRange = findUnitsInRangeOf(tile.x, tile.y, currentClick.info);
    }

    if (newInRange.length !== 0) {
      newInRange.forEach(loopUnitsInRange);
    }
  });

  if (minRange > 1) {
    unitsInRange = findUnitsInRangeOf(unitX, unitY, currentClick.info);
  }

  if (draw) {
    drawTiles(tilesToDraw, "movement");

    if (unitsInRange.length !== 0) {
      createDamageSquares(currentClick.info, unitsInRange, movementInfo, true);
    }
  }

  return movementInfo; //Check for duplicates

  function loopUnitsInRange(unit) {
    var unitId = unit.units_id;

    if (!unitsInRangeVerif[unitId]) {
      unitsInRange.push(unit);
      unitsInRangeVerif[unitId] = true;
    }
  }
}

function findTerrainCost(mType, x, y, unitTeam, player) {
  var _unitMap$x, _unitMap$x$y, _terrainInfo$x, _terrainInfo$x$y, _buildingsInfo$x, _buildingsInfo$x$y, _moveCosts$terrainId, _moveCosts$terrainId$;

  var coName = player.co_name;
  var power = player.players_co_power_on;
  var tempWCode = gameWeather.code;

  if (x > maxX - 1 || x < 0 || y < 0 || y > maxY - 1) {
    return null;
  } //Mark tile as A for tiles where there is an attackable unit


  var squareTeam = (_unitMap$x = unitMap[x]) === null || _unitMap$x === void 0 ? void 0 : (_unitMap$x$y = _unitMap$x[y]) === null || _unitMap$x$y === void 0 ? void 0 : _unitMap$x$y.team;

  if (squareTeam && squareTeam != unitTeam) {
    return "A";
  } //No penalty for Olaf in snow


  if (coName === "Olaf" && tempWCode === "S") {
    tempWCode = "C";
  } //Penalty for Olaf in rain


  if (coName === "Olaf" && tempWCode === "R") {
    tempWCode = "S";
  } //No Penalty for Drake in rain


  if (coName === "Drake" && tempWCode === "R") {
    tempWCode = "C";
  }

  var terrainId = ((_terrainInfo$x = terrainInfo[x]) === null || _terrainInfo$x === void 0 ? void 0 : (_terrainInfo$x$y = _terrainInfo$x[y]) === null || _terrainInfo$x$y === void 0 ? void 0 : _terrainInfo$x$y.terrain_id) || ((_buildingsInfo$x = buildingsInfo[x]) === null || _buildingsInfo$x === void 0 ? void 0 : (_buildingsInfo$x$y = _buildingsInfo$x[y]) === null || _buildingsInfo$x$y === void 0 ? void 0 : _buildingsInfo$x$y.terrain_id);
  var mCost = (_moveCosts$terrainId = moveCosts[terrainId]) === null || _moveCosts$terrainId === void 0 ? void 0 : (_moveCosts$terrainId$ = _moveCosts$terrainId[tempWCode]) === null || _moveCosts$terrainId$ === void 0 ? void 0 : _moveCosts$terrainId$[mType]; //Black tile for no terrain id

  if (mCost === undefined) {
    return 0;
  }

  mCost = parseInt(mCost);

  if (mCost && tempWCode !== "S") {
    if (coName === "Sturm" || coName === "Lash" && power !== "N") {
      mCost = 1;
    }
  }

  return mCost;
}

function checkTeleportTile(x, y) {
  var _terrainInfo$x2, _buildingsInfo$x2;

  var tileExists = ((_terrainInfo$x2 = terrainInfo[x]) === null || _terrainInfo$x2 === void 0 ? void 0 : _terrainInfo$x2[y]) || ((_buildingsInfo$x2 = buildingsInfo[x]) === null || _buildingsInfo$x2 === void 0 ? void 0 : _buildingsInfo$x2[y]);

  if (tileExists) {
    var _terrainInfo$x3, _terrainInfo$x3$y;

    if (((_terrainInfo$x3 = terrainInfo[x]) === null || _terrainInfo$x3 === void 0 ? void 0 : (_terrainInfo$x3$y = _terrainInfo$x3[y]) === null || _terrainInfo$x3$y === void 0 ? void 0 : _terrainInfo$x3$y.terrain_id) === 195) {
      //teleport tile
      return true;
    }
  }

  return false;
}

function findShortestPath(solved, end) {
  var dist = solved.dist,
      previous = solved.previous;
  var path = []; //Case where target tile is an enemy unit

  if (dist[end] === Infinity && previous[end]) end = previous[end];
  if (dist[end] === Infinity) return path;

  for (var i = end; i !== null; i = previous[i]) {
    path.push(i);
  }

  return path.reverse();
}

function findBorders(node, dist) {
  var borderWidth = "";
  borderWidth += dist[node - maxX] != Infinity ? "0 " : "1px ";
  borderWidth += dist[node + 1] != Infinity ? "0 " : "1px ";
  borderWidth += dist[node + maxX] != Infinity ? "0 " : "1px ";
  borderWidth += dist[node - 1] != Infinity ? "0 " : "1px ";
  return borderWidth;
}

function findCostMultiplier(playerId, unitValue) {
  var coName = playersInfo[playerId].co_name;
  var costs = {
    Kanbei: 1.2,
    Colin: 0.8,
    Hachi: function () {
      var power = playersInfo[playerId].players_co_power_on;

      if ((power === "Y" || power === "S") && !unitValue) {
        return 0.5;
      } else {
        return 0.9;
      }
    }()
  };
  return costs[coName] || 1;
}

function checkTargetTile(x, y) {
  var currentUnit = currentClick.info;
  var optionsDisplay = [];
  var currentCargo = currentUnit.units_cargo1_units_id || currentUnit.units_cargo2_units_id ? true : false;

  if (unitMap[x] && unitMap[x][y] && currentUnit.units_id !== unitMap[x][y].units_id) {
    var targetUnitId = unitMap[x][y].units_id;
    var targetUnit = unitsInfo[targetUnitId];
    var targetName = targetUnit.units_name; //Load option

    var canLoad = checkCargo(targetUnit, currentUnit);
    var targetCargo = targetUnit.units_cargo1_units_id || targetUnit.units_cargo2_units_id ? true : false;

    if (canLoad) {
      var loadOption = {
        option: "Load",
        clickable: true
      }; //Transport is full

      if (canLoad !== "Y") {
        loadOption.clickable = false;
        loadOption.message = canLoad;
      }

      optionsDisplay.push(loadOption);
    } //Join option


    var targetUnitPId = targetUnit.units_players_id;

    if (targetName === currentUnit.units_name && targetUnit.units_hit_points < 10 && !targetCargo && !currentCargo && targetUnitPId === getViewerPId()) {
      optionsDisplay.push({
        option: "Join",
        clickable: true
      });
      return optionsDisplay;
    }

    if (optionsDisplay.length !== 0) return optionsDisplay;
    return;
  } //Unload option


  var isLandingTile = checkLanding(currentCargo, currentUnit, x, y);

  if (isLandingTile && currentUnit.units_x === x && currentUnit.units_y === y) {
    optionsDisplay.push({
      option: "Unload",
      clickable: true
    });
  } //Repair option


  var neighbours = loopNeighbours(x, y, currentUnit);
  var alliedNeighbours = neighbours.allied.length !== 0;

  if (currentUnit.units_name === "Black Boat" && alliedNeighbours) {
    optionsDisplay.push({
      option: "Repair",
      clickable: true
    });
  } //Supply option


  if (currentUnit.units_name === "APC" && alliedNeighbours) {
    optionsDisplay.push({
      option: "Supply",
      clickable: true
    });
  } //Hide options


  if (currentUnit.units_name === "Stealth" || currentUnit.units_name === "Sub") {
    var hideOption = {
      option: "",
      clickable: true
    };
    var subDive = currentUnit.units_sub_dive;

    if (subDive === "N" || subDive === "R") {
      hideOption.option = "Hide";
      optionsDisplay.push(hideOption);
    } else {
      hideOption.option = "Unhide";
      optionsDisplay.push(hideOption);
    }
  } //Capture & Silo options


  var unitTeam = playersInfo[currentUnit.units_players_id].players_team;
  var targetTile = buildingsInfo[x] && buildingsInfo[x][y] ? buildingsInfo[x][y] : "Terrain";

  if (currentUnit.units_name === "Infantry" || currentUnit.units_name === "Mech") {
    var terrainName = targetTile.terrain_name;

    if (targetTile !== "Terrain" && unitTeam !== targetTile.buildings_team && !/Silo|Rubble/.test(terrainName)) {
      optionsDisplay.push({
        option: "Capt",
        clickable: true
      }); //Silo
    } else if (/(Silo)$/.test(terrainName)) {
      optionsDisplay.push({
        option: "Launch",
        clickable: true
      });
    }
  } //Explode option


  if (currentUnit.units_name === "Black Bomb") {
    optionsDisplay.push({
      option: "Explode",
      clickable: true
    });
  } //Fire option
  //Don't calculate damage for indirects that have moved


  if (currentUnit.units_short_range && (currentUnit.units_x !== x || currentUnit.units_y !== y)) {} else if (currentUnit.units_ammo !== 0 || currentUnit.units_second_weapon) {
    //Get units in range of attacker and store in currentClick
    var unitsInRange = findUnitsInRangeOf(x, y, currentUnit, false);

    if (unitsInRange.length !== 0) {
      var unitAmmo = currentUnit.units_ammo;
      var secondWeapon = currentUnit.units_second_weapon;
      var fireOption = {
        option: "Fire",
        clickable: true
      };

      if (!unitAmmo && !secondWeapon) {
        fireOption.clickable = false;
        fireOption.message = "Unit has no ammos!";
      }

      optionsDisplay.unshift(fireOption);
      currentClick.unitsInRange = unitsInRange;
    }
  } //Delete option


  if (x === currentUnit.units_x && y === currentUnit.units_y) {
    optionsDisplay.push({
      option: "Delete",
      clickable: true
    });
  } //Wait option


  optionsDisplay.push({
    option: "Wait",
    clickable: true
  });
  return optionsDisplay;
}

function checkLanding(cargo, unit, x, y) {
  var terrainName = terrainInfo[x] && terrainInfo[x][y] && terrainInfo[x][y].terrain_name || buildingsInfo[x] && buildingsInfo[x][y] && buildingsInfo[x][y].terrain_name;
  if (!terrainName) return;
  var unitName = unit.units_name;
  if (!cargo) return false; //Landers and black boats can unload anywhere

  if ((unitName === "T-Copter" || unitName === "Lander" || unitName === "Black Boat") && !/Sea|Reef/.test(terrainName)) {
    return true;
  } else if (unitName === "APC" || unitName === "Cruiser" || unitName === "Carrier") {
    return true;
  }
}

function checkCargo(cargoUnit, currentUnit) {
  var firstCargo = cargoUnit.units_cargo1_units_id;
  var secondCargo = cargoUnit.units_cargo2_units_id;
  var mType = currentUnit.units_movement_type;
  var fullMsg = "Transport is full!";
  var cargoPId = cargoUnit.units_players_id;
  var currentUnitPId = currentUnit.units_players_id;

  if (cargoPId !== currentUnitPId) {
    return "Transport is not own";
  }

  if (currentUnit.units_name === "Infantry" || currentUnit.units_name === "Mech") {
    if (cargoUnit.units_name === "APC" || cargoUnit.units_name === "T-Copter") {
      if (!firstCargo) {
        return "Y";
      }

      return fullMsg;
    } else if (cargoUnit.units_name === "Black Boat") {
      if (!firstCargo || !secondCargo) {
        return "Y";
      }

      return fullMsg;
    }
  }

  if ((currentUnit.units_name === "B-Copter" || currentUnit.units_name === "T-Copter") && cargoUnit.units_name === "Cruiser") {
    if (!firstCargo || !secondCargo) {
      return "Y";
    } else {
      return fullMsg;
    }
  } else if (mType === "A" && cargoUnit.units_name === "Carrier") {
    if (!firstCargo || !secondCargo) {
      return "Y";
    }

    return fullMsg;
  } else if (mType !== "A" && mType !== "L" && mType !== "S" && cargoUnit.units_name === "Lander") {
    if (!firstCargo || !secondCargo) {
      return "Y";
    }

    return fullMsg;
  }

  return false;
}

function loopNeighbours(x, y, movingUnit) {
  var xv = [-1, 1, 0, 0];
  var yv = [0, 0, -1, 1];
  var neighbours = {
    allied: [],
    enemy: [],
    team: []
  }; //If a unit is given, take it's coordinates
  //Otherwise take the coordinates given as parameters

  var unitX = movingUnit && movingUnit.units_x !== null ? movingUnit.units_x : null;
  var unitY = movingUnit && movingUnit.units_y !== null ? movingUnit.units_y : null;
  var startX = unitX !== null ? unitX : x;
  var startY = unitY !== null ? unitY : y;
  var viewerTeam = playersInfo[getViewerPId()] && playersInfo[getViewerPId()].players_team;

  for (var _i16 = 0; _i16 < 4; _i16++) {
    var ax = x + xv[_i16];
    var ay = y + yv[_i16];
    var unitId = unitMap[ax] && unitMap[ax][ay] ? unitMap[ax][ay].units_id : null;
    var unit = unitsInfo[unitId];

    if (unit) {
      var unitTeam = playersInfo[unit.units_players_id].players_team;

      if (unitId && unit.units_players_id === getViewerPId()) {
        //Don't add moving unit to own units
        if (ax === startX && ay === startY) {} else {
          neighbours.allied.push(unit);
        }
      }

      if (unitId && (unitTeam === viewerTeam || grantedVisions[unitTeam])) {
        neighbours.team.push(unit);
      }

      if (unitTeam !== viewerTeam) {
        neighbours.enemy.push(unit);
      }
    }
  }

  return neighbours;
}

function findUnitsInRangeOf(x, y, currentUnit) {
  var maxRange = currentUnit.units_long_range;
  var minRange = currentUnit.units_short_range;
  var currentUnitTeam = playersInfo[currentUnit.units_players_id].players_team; //Increment range by 1 for direct units for the loop

  if (minRange <= 0) {
    minRange = 1;
    maxRange = 1;
  }

  var attAmmo = currentUnit.units_ammo;
  var attName = currentUnit.units_name;
  var attGenId = genericUnits[currentUnit.units_name].units_id;
  var unitsInRange = [];

  for (var _i18 = -maxRange; _i18 <= maxRange; _i18++) {
    for (var j = -maxRange; j <= maxRange; j++) {
      var absoluteSum = Math.abs(_i18) + Math.abs(j);

      if (absoluteSum <= maxRange && absoluteSum >= minRange) {
        var ax = x + _i18;
        var ay = y + j;
        var terrainName = buildingsInfo[ax] && buildingsInfo[ax][ay] ? buildingsInfo[ax][ay].terrain_name : "Terrain";
        var ATTACK1 = baseDamageValues.ATTACK1;
        var ATTACK2 = baseDamageValues.ATTACK2; //If there is a unit and a pipe seam on the same tile, only add the unit
        //Enemy unit is in range

        if (unitMap[ax] && unitMap[ax][ay] && unitMap[ax][ay].team !== currentUnitTeam) {
          var unitId = unitMap[ax][ay].units_id;
          var unit = unitsInfo[unitId];
          var defGenId = genericUnits[unit.units_name].units_id;

          if (!(ATTACK1[attGenId] && ATTACK1[attGenId][defGenId]) && !(ATTACK2[attGenId] && ATTACK2[attGenId][defGenId])) {
            continue;
          } //Skip out of ammos with no secondary attack


          if (ATTACK1[attGenId] && ATTACK1[attGenId][defGenId] && attAmmo === 0 && !(ATTACK2[attGenId] && ATTACK2[attGenId][defGenId])) continue; //Exclude hidden units that can't be attacked by certain units

          var defName = unit.units_name;
          var subDive = unit.units_sub_dive;
          var defHidden = subDive === "Y" || subDive === "D";
          if (defHidden && defName === "Stealth" && attName !== "Stealth" && attName !== "Fighter") continue;
          if (defHidden && defName === "Sub" && attName !== "Cruiser" && attName !== "Sub") continue;
          unitsInRange.push(unitsInfo[unitId]);
        } //Terrain in range is pipe seam: only add if there is no unit on top of it
        //Use Neotank as defender
        else if (/Seam/.test(terrainName) && !(unitMap[ax] && unitMap[ax][ay])) {
          var _defGenId = genericUnits["Neotank"].units_id;

          if (!(ATTACK1[attGenId] && ATTACK1[attGenId][_defGenId]) && !(ATTACK2[attGenId] && ATTACK2[attGenId][_defGenId])) {
            continue;
          } //Skip out of ammos with no secondary attack


          if (ATTACK1[attGenId] && ATTACK1[attGenId][_defGenId] && attAmmo === 0 && !(ATTACK2[attGenId] && ATTACK2[attGenId][_defGenId])) continue;
          unitsInRange.push({
            units_id: buildingsInfo[ax][ay].buildings_id,
            units_name: "Pipe Seam",
            units_x: ax,
            units_y: ay
          });
        }
      }
    }
  }

  return unitsInRange;
}

function calculateDamage(attackerUnit, defenderUnit, endTile) {
  var attackerPId = attackerUnit.units_players_id;
  var defenderPId = defenderUnit.units_players_id;
  var attackerInfo = getPlayerInfo(playersInfo[attackerPId], attackerUnit, "attacker", endTile);
  var defenderInfo = getPlayerInfo(playersInfo[defenderPId], defenderUnit, "defender");
  return axios.post("api/calculator/calculate_new.php", {
    attacker: attackerInfo,
    defender: defenderInfo,
    gameId: gameId
  });

  function getPlayerInfo(player, unit, position, endTile) {
    var x = unit.units_x;
    var y = unit.units_y;
    var pipeSeam = unit.units_name === "Pipe Seam";
    var unitRange = unit.units_short_range;

    if (position === "attacker" && unitRange <= 1 && endTile) {
      //Take position at the end of the path
      x = endTile % maxX;
      y = (endTile - x) / maxX;
    }

    var terrain = terrainInfo[x] && terrainInfo[x][y] ? terrainInfo[x][y] : buildingsInfo[x][y];

    if (!pipeSeam) {
      return {
        cities: GAME_FLAGS__KINDLE_SCOP ? player.numProperties : player.cities,
        co: {
          co_name: player.co_name.replace(" ", ""),
          co_id: player.players_co_id
        },
        country: {
          code: player.countries_code,
          name: player.countries_name.replace(" ", "")
        },
        funds: player.players_funds,
        hp: unit.units_hit_points,
        playerId: player.players_id,
        power: player.players_co_power_on,
        terrain: {
          terrain_name: terrain.terrain_name.replace(/[_ ]/g, ""),
          id: terrain.terrain_id,
          terrain_defense: terrain.terrain_defense
        },
        towers: player.towers,
        unit: {
          units_ammo: unit.units_ammo,
          units_name: unit.units_name.replace(" ", ""),
          unit_id: unit.units_id,
          units_id: genericUnits[unit.units_name].units_id
        }
      };
    } else {
      //Default values for pipe seams
      return {
        cities: 0,
        co: {
          co_name: "Andy",
          co_id: 1
        },
        country: {
          code: "os",
          name: "OrangeStar"
        },
        funds: 0,
        hp: 10,
        power: "N",
        terrain: {
          terrain_name: "HRoad",
          id: 15,
          terrain_defense: 0
        },
        towers: 0,
        unit: {
          units_name: "Pipe Seam",
          units_id: 46
        }
      };
    }
  }
}
 return {calculateDamage,getMovementTiles,findShortestPath,findCostMultiplier,checkTargetTile,findUnitsInRangeOf,
  set currentClick(value){currentClick=value;},get currentClick(){return currentClick;}};
}
