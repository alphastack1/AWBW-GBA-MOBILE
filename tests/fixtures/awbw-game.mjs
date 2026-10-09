import publicRules from './awbw-public-rules.json' with {type:'json'};
export function gamePage(username='player',mutate){
 const terrain={},fog=[];for(let x=0;x<4;x++){terrain[x]={};fog[x]=[];for(let y=0;y<4;y++){terrain[x][y]={terrain_id:1,terrain_name:'Plain',terrain_defense:1};fog[x][y]=x<2?1:0;}}
 const unit=(id,owner,x,y,extra={})=>({...publicRules.genericUnits.Infantry,units_id:id,units_players_id:owner,units_x:x,units_y:y,units_name:'Infantry',units_hit_points:10,units_fuel:99,units_ammo:0,units_moved:0,units_sub_dive:'N',...extra});
 const fields={gameId:123,maxX:4,maxY:4,gameDay:12,gameFog:'Y',gameEndDate:'',loggedIn:99,viewerPId:7,currentTurn:8,playersInfo:{7:{users_username:username,players_team:'7',players_funds:800,countries_code:'ge',countries_name:'Green Earth',co_name:'Adder'},8:{users_username:'opponent',players_team:'8',players_funds:'?',countries_code:'yc'}},terrainInfo:terrain,buildingsInfo:{0:{0:{terrain_id:49,terrain_name:'Green Earth Base',terrain_defense:3,buildings_id:5,buildings_players_id:7}}},fogInfo:fog,viewerColors:{7:'ge',8:'yc'},unitsInfo:{11:unit(11,7,1,1,{units_cargo1_units_id:14}),12:unit(12,8,3,3),13:unit(13,8,1,2),14:unit(14,7,1,1),15:unit(15,8,1,3,{units_sub_dive:'Y'})}};
 Object.assign(fields,publicRules,{freezeGame:false,grantedVisions:[],banUnits:{},labUnits:{},clientLastUpdated:'fixture-update',GAME_FLAGS__KINDLE_SCOP:1});
 delete terrain[0][0]; // Native terrain/building maps do not overlap.
 Object.assign(fields.buildingsInfo[0][0],{buildings_x:0,buildings_y:0,buildings_team:'7',buildings_capture:20});
 mutate?.(fields);
 return '<html><a href="logout.php">Log out</a><script>\n'+Object.entries(fields).map(([key,value])=>`const ${key} = ${JSON.stringify(value)};`).join('\n')+'\nconst gameWeather = {code: "C", name: "clear"};\n</script></html>';
}
