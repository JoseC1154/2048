// Deterministic scenarios live in tests only. Production openings remain random.
module.exports = function fixture() {
  return {
    pieces: [
      {id:1,x:1,y:2,front:'C',back:'C',face:0,group:null},
      {id:2,x:3,y:2,front:'E',back:'E',face:0,group:null},
      {id:3,x:3,y:3,front:'G',back:'G',face:0,group:null},
      {id:4,x:5,y:4,front:'F♯',back:'F♯',face:0,group:null},
      {id:5,x:0,y:5,front:'D',back:'D',face:0,group:null}
    ],
    selected:[],activeId:1,mp:12,score:0,nextGroup:1,nextPiece:6,bonusGroups:{},
    completed:false,difficulty:'beginner',rescueUsed:false,gameOver:false,
    semitones:1,semitoneForecast:[-1,4,7],recoveryCount:0,chordsPlayed:0
  };
};
