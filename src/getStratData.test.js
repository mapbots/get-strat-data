const { main, dateSToZ, dateZToS, proxify }
             = require('./getStratData.js');
const chai   = require('chai');
const expect = chai.expect;
chai.should();

const  L   = (...args) => console.log(...args);
const  itt = (s, f)    => it(s, f) .slow(9e9).timeout(99e9);
const _it  = ()        => { };
const _itt = ()        => { };


const dateTagNowMinusXDays = n => (new Date(Date.now() - n*864e5)).toISOString()
                                  .slice(2, 10).replace(/-/g, '');
const someDaysAgo = dateTagNowMinusXDays(10);





describe('getStratData', () => {

  itt('utilities', async () => {
    dateSToZ('210320-233005'       ).should.equal('2021-03-20T23:30:05Z');
    dateSToZ('210320'              ).should.equal('2021-03-20T00:00:00Z');
    dateZToS('2021-03-20T23:30:04Z').should.equal('210320-233004');
    dateZToS('2021-03-20', true    ).should.equal('210320');
  });


  _itt('test', async () => {
    var ans = await main({
      proxify,

      ...(
      0&& {
        fromDay:     someDaysAgo,
        stratsToGet: ['lion'],  ///['lion', 'tige', 'cat'],
        addQuotes: 1,  addFactors: 1,  addPerfs: 1,  addDD: 1,  addTrades: 1,
        pfAsF: 1,  ddAsF: 1,
      } ||
      1&& {
        fromDay:     someDaysAgo,
        stratsToGet: ['tige', 'cat'],
        transpose: 1,
        addQuotes: 0,  addFactors: 1,  addPerfs: 1,  addTrades: 0,
        //gitCommit: {url:'https://api.github.com/repos/mapbots/data/contents/'+
        //'strats.json',  token: '...' },
      }),

      format:
        0&& 'tsv'   ||
        0&& 'json5' ||
        1&& 'json'  || 0,

      log: console.log,
      outputFile: false,  ///'./stratData.json',
    });

    L(ans.data);
    ///L(ans.data.trades);
  });


  _itt('slim', async () => {
    await main({ proxify,  outputFile: './%DATE%-stratSheet-slim.tsv',
                 addQuotes: 0,  addFactors: 1,  addTrades: 0,  log: L,
                 fromDay: '180101'
               });
  });


  _itt('full', async () => {
    await main({ proxify,  outputFile: './%DATE%-stratSheet-full.tsv',
                 addQuotes: 1,  addFactors: 1,  addTrades: 1,  log: L
               });
  });

});
