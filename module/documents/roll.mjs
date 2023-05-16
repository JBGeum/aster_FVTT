export async function asterRoll(ablValue, rollData){
  let roll;
  // let r = new Roll("2d20kh + @prof + @strMod", {prof: 2, strMod: 4});
  roll = new Roll("2d6 + @ablValue", {ablValue: ablValue});
  //https://foundryvtt.com/api/classes/client.Roll.html#dice
  await roll.evaluate({async: true});
  return roll;
}