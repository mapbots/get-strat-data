const fs    = require('fs');
const _util = require('util');
const fetch = require('node-fetch');
const TAB   = '\t';
const NL    = '\n';

module.exports = { main, dateSToZ, dateZToS, proxify };


const OptDefault = {
  stratsToGet:     [],    // (Is filled further below)
  fetchInParallel: true,
  maxTries_fetch:  5,
  proxify:         s=>s,  // E.g.:  s => 'https://proxyserver/xyz?u=' + s
  fixQuoteDates:   true,  // Patch a Napbots issue: add 1 day to quote dates.
  fromDay:           // <-This limits Quotes&Factors, not past-year-of-Trades.
    0&& '190201' ||  // Start of lion and fox data (BTC/ETH).
    0&& '190601' ||  // Start of peli (MATIC).
    0&& '200501',    // Start of hors (SOL).
  addQuotes:  0,  // Add "quotes" data, from which the perf. factors are derived?
  addFactors: 1,  // Add each day's 'factor' (=quoteToday/quoteYesterday) ?
  addTrades:  0,
  addDD:      1,
  addPerfs:   1,
  ddAsF:      1,  // Show drawdown as factor, e.g. 0.71 instead of -0.29?
  pfAsF:      1,  // Show perf.s   as factor, e.g. 1.42 instead of  0.42?
  transpose:  0,  // Show factors-obj with as keys: days, instead of bot names?
  noneInJSON: 0,  // Tells how to show a no-data factor in JSON/5, e.g. '' or 0.
  format:     'tsv',  // 'tsv' or 'json5' or 'json'.
  outputFile: './stratSheet.tsv',  /// './%DATE%-stratSheet.tsv',
  gitCommit:  false,     // Either falsy or `{ url: ..., token: ... }`.
  log:        () => {},  // E.g.: `console.log`.  To log nothing: `()=>{}`.
};


const stratNamesToCodes = {
  lion: 'STRAT_BTC_ETH_USD_H_1',
  tige: 'STRAT_BTC_USD_H_4_V2',
  cat : 'STRAT_BTC_USD_H_5',
  rhin: 'STRAT_BNB_USD_LO_D_1',
  hors: 'STRAT_SOL_USD_LO_D_1',
  lama: 'STRAT_ADA_USD_LO_D_1',
  peli: 'STRAT_MATIC_USD_LO_D_1',
  flam: 'STRAT_DOGE_USD_LO_D_1',
  coli: 'STRAT_XTZ_USD_LO_D_1',
  phoe: 'STRAT_AI_TOP_PERFORMER_H_1',
  drag: 'STRAT_AI_TOP_2_PERFORMERS_H_1',
  pega: 'STRAT_AI_TOP_3_PERFORMERS_H_1',
  wolf: 'STRAT_BTC_USD_H_6',
  ostr: 'STRAT_ETH_USD_H_6',
  deer: 'STRAT_BTC_USD_D_2_V2',
  elep: 'STRAT_XRP_USD_D_1',
  peng: 'STRAT_ETH_USD_D_3',
  pand: 'STRAT_BTC_ETH_USD_LO_D_1',
  puma: 'STRAT_ETH_USD_H_3_V2',
  fox : 'STRAT_BTC_ETH_USD_LO_H_1',
  hipp: 'STRAT_ETH_USD_VOLUME_H_1',
  shee: 'STRAT_BTC_ETH_USD_D_1_V2',
  falc: 'STRAT_ETH_USD_H_4_V2',
  dog : 'STRAT_ETH_USD_D_2_V2',
  lamb: 'STRAT_BTC_USD_D_3',
  eagl: 'STRAT_BTC_USD_H_3_V2',
  rabb: 'STRAT_BTC_USD_VOLUME_H_1',
  kang: 'STRAT_ETH_USD_FUNDING_8H_1',
  gira: 'STRAT_LTC_USD_D_1',
  buff: 'STRAT_BCH_USD_LO_D_1',
  cow : 'STRAT_EOS_USD_D_2',
  croc: 'STRAT_BTC_USD_FUNDING_8H_1',
  pack: 'STRAT_HIGH_VOL_H_1',
  shar: 'STRAT_LOW_VOL_H_1',
};

OptDefault.stratsToGet = Object.keys(stratNamesToCodes);

const napbotsURLPrefix = 'https://middle.napbots.com/v1/strategy/details/';





function uniq(arr) {
  var seen = new Set();
  return arr.filter(e => seen.has(e) ? false : seen.add(e));
}

function dateZToS(s, onlyDay) {  // E.g. '2021-03-20T23:30:04Z'–>'210320-233004'.
  s = s
    .replace(/^(....-..-..)Z?$/, '$1T00:00:00Z')
    .replace(/^..(..)-(..)-(..)T(..):(..):(..)Z?$/, '$1$2$3-$4$5$6');
  if (onlyDay) s = s.replace(/-000000$/, '');  // E.g. '210320-000000'–>'210320'.
  return s;
}

function dateSToZ(s) {
  return s
    .replace(/^(..)(..)(..)-(..)(..)(..)$/, '20$1-$2-$3T$4:$5:$6Z')
    .replace(/^(..)(..)(..)$/,              '20$1-$2-$3T00:00:00Z');
}

function todayInUTC() {            // E.g on 2021-08-16 01:30 CET DST(=UTC+2):..
  return new Date().toISOString()  // ..returns '210816'.
    .replace(/^..(..)-(..)-(..)T..:..:..\....Z$/, '$1$2$3z');
}

function nowInUTC(precision = 'm') {
  return new Date().toISOString()
    .replace(/^..(..)-(..)-(..)T(..):(..):(..)\....Z$/,
             '$1$2$3-$4$5' + (precision=='s'? '$6': '') + 'z');
}

function F(s, f = 2, p = 8) { // Num|Str->Str, w `f` decimals, up to `p` padding.
  return (+s).toFixed(f) .padStart(p);
}

function PS(s, p = 0, c = ' ') { return `${s}`.padStart(p, c); }
function PE(s, p = 0, c = ' ') { return `${s}`.padEnd  (p, c); }

function json5OneLine(obj, opt) {
  return _util
    .inspect(obj, { maxArrayLength: null, maxStringLength: null,
                    breakLength: Infinity, compact: true, depth: null, ...opt })
    .replace(/\r?\n\s*/g, ' ');
}

function proxify(s) {
  return s.replace(/(?<=\/\/)([^/]+)/,  (_, $1) =>
                   `${ $1.replace(/\./g, '-') }.translate.goog`);
}





/**
 *
 */
async function main(opt) {
  opt = setOpt(opt);

  var data = await fetchAllStrats(opt);

  opt.log('Calculating...');
  data = calcData(data, opt);


  if (opt.outputFile || opt.gitCommit) {
    var dataStr = serialize(data, opt);
  }

  if (opt.outputFile) {
    try { await writeDataToFile(dataStr, opt) }
    catch(err) { opt.log(err) }
  }


  if (opt.gitCommit) {
    opt.log('Uploading to GitHub...');
    var version = data.v ?  `v-${data.v}` :  '';
    try { await putFileOnGitHub(opt.gitCommit.url,  opt.gitCommit.token,
                                version,  dataStr,  opt)                 }
    catch(err) { opt.log(err) }
  }


  opt.log('Done');
  return { data,  dataStr };
}



/**
 *
 */
function setOpt(opt) {
  return { ...OptDefault, ...opt };
}



/**
 * Calls fetchStratRT() for each strategy, and returns the resulting data
 * in an object of JS-objects, with stratNames as keys.
 * (and with a `false` for any fetchStratRT that failed after several retries).
 */
async function fetchAllStrats(opt) {
  opt = setOpt(opt);

  var obj = {};

  async function func(stratName) {
    let ans = await fetchStratRT(stratName, opt);
    obj[stratName] = ans && ans.data || false;
  }

  if (opt.fetchInParallel) {
    await Promise.all( opt.stratsToGet.map(func) );
  }
  else {
    for (let stratName of opt.stratsToGet)  await func(stratName);
  }

  return obj;
}



/**
 * Calls fetchStrat(), and ReTries a few times if the first time/s failed.
 */
async function fetchStratRT(stratName, opt) {
  opt = setOpt(opt);

  for (var i = 0;  i < opt.maxTries_fetch;  i++) {
    var json = await fetchStrat(stratName, opt);
    if (json && json.success)  break;
    else {
      opt.log(`- Error for strat '${ stratName }', attempt ${ i+1 } }`)
      json = false;
    }
  }
  return json;
}



/**
 *
 */
async function fetchStrat(stratName, opt) {
  opt = setOpt(opt);

  try {
    let stratCode = stratNamesToCodes[stratName];
    let url0 = `${ napbotsURLPrefix }${ stratCode }`;
    let url  = opt.proxify(url0);
    opt.log(`Getting strat '${ stratName.padEnd(4) }'` +
            (url == url0 ?  '' :  ` at ${ url }`));

    let res = await fetch(
      url,
      { headers: {
          'accept'         : 'text/html,application/xhtml+xml,application/xml;' +
                             'q=0.9,image/webp,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.5',
          'sec-fetch-dest' : 'document',
          'sec-fetch-mode' : 'navigate',
          'sec-fetch-site' : 'cross-site',
          'pragma'         : 'no-cache',
          'cache-control'  : 'no-cache',
        },
        credentials: 'omit',
        method: 'GET',
        mode: 'cors',
      }
    );

    return await res.json();
  }
  catch(err) { opt.log(err);  return false }
}



/**
 *
 */
function calcData(dataAll, opt) {
  var strats = precalcData(dataAll, opt);
  var data = opt.format == 'tsv'   ?  calcTSV (strats, opt) :
             opt.format == 'json5' ||
             opt.format == 'json'  ?  calcJSON(strats, opt) :  false;
  return data;
}



/**
 *
 */
function precalcData(dataAll, opt) {
  return opt.stratsToGet.map(stratName => {
    let data  = dataAll[stratName];
    let label = data.label;
    let pf    = data.performance;

    return {
      name: ////label.toLowerCase().split(' ').pop().slice(0,4),
            stratName,
      code: data.code,
      dd:   pf.maxDrawdown,
      pf: {
        y1: pf.   oneYearPerformance,
        m3: pf.threeMonthPerformance,
        m1: pf.  oneMonthPerformance,
        w1: pf.   oneWeekPerformance,
        ym: pf.last12MonthPerfs.map(o => ({
          dt: o.year + '-' + `${o.month}`.padStart(2, '0'), ///dateZToS(..+'-00'),
          pf: o.perf,
        })),
      },
      quotes: pf.quotes[label].map((o, i, a) => ({
        dt: dateZToS((
              !opt.fixQuoteDates ?  o.date :  new
              Date(Date.parse(o.date+'T00:00Z')+ 864e5).toISOString().slice(0,10)
            ) + 'T00:00:00Z', true),
        q:  o.last,
        f:  i == 0 ?  1 :  o.last / a[i-1].last,
      })),
      trades: data.tradesInfo.trades
        .reverse()
        .filter(o => o.targetExpo  &&  o.tradePerf  &&  o.close != o.open)
        .map((o, nr) => ({
          nr: nr + 1,
          do: dateZToS(o.openTs  + 'Z'),
          dc: dateZToS(o.closeTs + 'Z'),
          cn: o.product.replace(/-USDT?$/,''),
          tx: o.targetExpo,
          ex: Math.max(-1, Math.min(1,  // Actually exposed, invested part.
                o.tradePerf / (o.close / o.open - 1) || 0)),
          o:  o.open,
          c:  o.close,
          pf: o.tradePerf,
        }))
    };
  });
}



/**
 * Collects all day-tags, for all quotes and bots; then unduplicates and sorts.
 */
function calcQuoteKeys(strats, opt) {
  var quoteKeys = !opt.addQuotes && !opt.addFactors ? [] : strats
    .reduce((a, st) => uniq([...a, ...st.quotes.map(o => o.dt)]),  [])  .sort();

  if (opt.fromDay)  quoteKeys = quoteKeys.filter(k => k > opt.fromDay);

  return quoteKeys;
}



/**
 * Collects all datetime-tags, with 'c'/'o' suffix representing close/open-trade.
 * Does so for all trades and bots; then unduplicates and sorts.
 */
function calcTradeKeys(strats, opt) {
  var tradeKeys = !opt.addTrades ? [] : strats
    .reduce((a, st) => uniq([...a, ...st.trades.map(o => `${o.dc}c`),
                                   ...st.trades.map(o => `${o.do}o`)]), [])
    .sort();

  ///// Don't remove any tradeKeys, as it could cut between open+close signals.
  ///// (Note: Napbots adds virtual open-positions at one year-to-date).
  ///tradeKeys = tradeKeys.filter(k => k > opt.fromDay);

  return tradeKeys
}



/**
 *
 */
function calcTSV(strats, opt) {
  if (opt.addQuotes || opt.addFactors) {
    var quoteKeys = calcQuoteKeys(strats, opt);
  }
  if (opt.addTrades) {
    var tradeKeys = calcTradeKeys(strats, opt);
  }

  var headers = [
    PE('name',  4),
    PE('code', 29),
    ...(!opt.addPerfs   ? [] : [ PS('pf-1Y', 11),
                                 PS('pf-3M', 11),
                                 PS('pf-1M', 11),
                                 PS('pf-1W', 11) ]),
    ...(!opt.addDD      ? [] : [ PS('dd'  ,   5) ]),
    ...(!opt.addPerfs   ? [] : strats[0].pf.ym.map(o => PS('pf-' + o.dt, 11))),
    ...(!opt.addQuotes  ? [] : quoteKeys      .map(h => PS( 'q-' + h,    14))),
    ...(!opt.addFactors ? [] : quoteKeys      .map(h => PS( 'f-' + h,     8))),
    ...(!opt.addTrades  ? [] : tradeKeys      .map(h => PS(        h,    20))),
  ];

  var ddAF = opt.ddAsF ? 1 : 0;
  var pfAF = opt.pfAsF ? 1 : 0;

  var data = [headers].concat(
    strats.reduce((arr, st) => arr.concat([[
      PE(st.name,  4),
      PE(st.code, 29),
      ...(!opt.addPerfs   ? [] : [ F(st.pf.y1 + pfAF,  8, 11),
                                   F(st.pf.m3 + pfAF,  8, 11),
                                   F(st.pf.m1 + pfAF,  8, 11),
                                   F(st.pf.w1 + pfAF,  8, 11) ]),
      ...(!opt.addDD      ? [] : [ F(st.dd    + ddAF,  2,  5) ]),
      ...(!opt.addPerfs   ? [] : st.pf.ym.map(o => F(o.pf + pfAF,  8, 11))),
      ...(!opt.addQuotes  ? [] : quoteKeys.map(k => {
        let o = st.quotes.find(q => q.dt == k);
        return PS(!o ?  '' :      F(o.q,   4,  0), 14);
      })),
      ...(!opt.addFactors ? [] : quoteKeys.map(k => {
        let o = st.quotes.find(q => q.dt == k);
        return PS(!o ?  '' :      F(o.f,   6,  0),  8);
      })),
      ...(!opt.addTrades  ? [] : tradeKeys.map(k => {
        let s = '';
        let t = st.trades.find(t => `${t.dc}c` == k);
        if (t && t.ex)  s = `${ t.cn }c${ F(t.ex, 0, 4) }${ F(t.pf, 6, 10) }`;
        t     = st.trades.find(t => `${t.do}o` == k);
        if (t && t.ex)  s = `${ t.cn }o${ F(t.ex, 0, 4) }`;
        return PS(s,                                                    20);
      }))
      ///.filter(x=>x),  // (For dev inspection).
    ]]), [])
  );

  ///console.log(strats[0]);  console.log(quoteKeys);  console.log(tradeKeys);
  ///console.dir(data.slice(0,2).concat(data.slice(4,5)), {maxArrayLength:500});
  return data;
}



/**
 *
 */
function calcJSON(strats, opt) {
  var data = { v: nowInUTC('m') };  // Add data's version.
  var ddAF = opt.ddAsF ? 1 : 0;
  var pfAF = opt.pfAsF ? 1 : 0;

  if (opt.addDD || opt.addPerfs) {
    data.bots = strats.reduce((o, st) => ({ ...o, [st.name]: {
      id: st.code,
      ...(!opt.addDD    ? {} : { dd: +F(st.dd    + ddAF, 2) }),
      ...(!opt.addPerfs ? {} : { y1: +F(st.pf.y1 + pfAF, 4),
                                 m3: +F(st.pf.m3 + pfAF, 4),
                                 m1: +F(st.pf.m1 + pfAF, 4),
                                 w1: +F(st.pf.w1 + pfAF, 4) }),
      ...(!opt.addPerfs ? {} : st.pf.ym.reduce((q, x) => ({ ...q,
                                 ['ym' +  x.dt.replace(/^..(..)-(..)/, '$1$2')] :
                                     +F( x.pf    + pfAF, 4)
                               }), {})),
    }}), {});
  }


  if (opt.addQuotes || opt.addFactors) {
    var days  = calcQuoteKeys(strats, opt).map(s => +s);
    data.days = days;

    if (opt.addQuotes )  data.quotes  = {};
    if (opt.addFactors)  data.factors = {};

    strats.forEach(st => {
      if (opt.addQuotes) {
        let map = st.quotes.reduce((m, q) => ((m[q.dt] = q.q), m), {});
        data.quotes [st.name] =days.map(k => map[k] ||         opt.noneInJSON);
      }
      if (opt.addFactors) {
        let map = st.quotes.reduce((m, q) => ((m[q.dt] = q.f), m), {});
        data.factors[st.name] = days.map(k => map[k] ?  +F(map[k], 6) :
                                                               opt.noneInJSON);
      }
    });

    if (opt.transpose) {
      function transp(key) {
        let matrix = Object.keys(data[key]).map(name => data[key][name]);
        data[key] = days.reduce((o, day, i) =>
          (o[day] = matrix.map(row => row[i]),  o), {});
      }
      if (opt.addQuotes)  transp('quotes');
      if (opt.addFactors) transp('factors');
      delete data.days;
    }
  }


  const PR = (x, p) => +(+x).toPrecision(p);
  if (opt.addTrades) {
    var arr = [];
    strats.forEach(st =>
      st.trades.forEach(tr => {
        ///if (!tr.pf)  return;
        arr.push([    // 1.This sub-array represents the opening of the position.
          tr.do,         // Timestamp.
          st.name,       // Bot name.  /// + '-' +  PS(tr.nr, 2, 0),
          ///tr.nr,      // Trade nr (=pos in bot's YTD trades list).
          tr.cn,         // Coin type.
          PR(tr.ex, 2),  // Invested/exposed part, e.g. 0.5, 1, -0.5, or -0.021.
          ///+F(tr.o, 8),  // Coin price at open-time.
        ],[           // 2.This sub-array represents the closing of the position.
          tr.dc,
          st.name,
          ///tr.nr,
          tr.cn,
          PR(tr.ex, 2),  ///0, ///-tr.ex, //Closing pos=negating opened-exposure.
          ///+F(tr.c, 8),
          +F(tr.pf + pfAF, 8)  // Performance-factor. Presence of this element..
        ]);                    // ..tells that this subarray represents a 'close'.
      })
    );
    arr.sort((a, b) => a[0] < b[0] ?  -1 :
                       a[0] > b[0] ?   1 :
                       b.length - a.length || // Sort a close before a next open.
                       (  (opt.stratsToGet.findIndex(s => s == a[1]) || 0)
                        - (opt.stratsToGet.findIndex(s => s == b[1]) || 0) )  );
    data.trades = arr;
  }

  return data;
}



/**
 * Converts data into a string, for writing to the filetype `opt.format`.
 */
function serialize(data, opt) {
  var s;

  if      (opt.format == 'tsv') {
    s = data .map(row => row.join(TAB)) .join(NL)  + NL;
            ///s = s.replace(/ *\t */g, TAB);
  }

  else if (opt.format == 'json5' || opt.format == 'json') {
    const X   = s => s.replace(/ ?''/g, '')
                      .replace(/(?<=\[|\{) | (?=\]|\})/g, '')
                      .replace(/(?<=:) /g, '');
    const CNL = ',' + NL;
    var parts = [];
    parts.push([
      `v: '${ data.v }'`,
    ]);
    parts.push([
      'bots: {',
      Object.keys(data.bots   ).map(key => '  ' + PE(key, 4) + ': ' +
                          X(json5OneLine(data.bots   [key]))).join(CNL),
      '}'
    ]);
    if (data.days   )  parts.push([
      'days: [',
      '  ' + data.days.join(', '),
      ']'
    ]);
    if (data.quotes)  parts.push([
      'quotes: {',
      Object.keys(data.quotes ).map(key => '  ' + PE(key, 4) + ': ' +
                          X(json5OneLine(data.quotes [key]))).join(CNL),
      '}'
    ]);
    if (data.factors)  parts.push([
      'factors: {',
      Object.keys(data.factors).map(key => '  ' + PE(key, 4) + ': ' +
                          X(json5OneLine(data.factors[key]))).join(CNL),
      '}'
    ]);
    if (data.trades)  parts.push([
      'trades: [',
      data.trades    .map(tr   =>  '  ' + X(json5OneLine(tr))
                          .replace(/(?<='[a-z]{3}')(?=,)/, ' ')) //=>`'cat' ,`
                     .join(CNL),
      ']'
    ]);

    s = '{' + NL +  parts.map(a => a.join(NL)) .join(',' + NL)  + NL + '}';


    // If needed, convert the JSON5 to (legible) JSON.
    if (opt.format == 'json') {
      s = s
        .replace(/(?<=[^'"])([a-z_$0-9]+)(?=\s*:)/g, '"$1"')  // Add "" to keys.
        .replace(/'(.*?)'/g, '"$1"')         // Change single to double quotes.
        .replace(/(?<=[[,] *)(?=,)/g, '""')  // Change empty array items to "".
        .replace(/(?<=, *)(?=])/g, '""')     //  "
        .replace(/(?<!\n *) +(?!:)/g, '')    // Remove most spaces.
    }
  }

  else s = JSON.stringify(data);

  return s;
}



/**
 *
 */
async function writeDataToFile(dataStr, opt) {
  try {
    let fn = opt.outputFile
      .replace(/%DATE%/g,     todayInUTC())
      .replace(/%DATETIME%/g, nowInUTC());

    await fs.promises.writeFile(fn, dataStr);
  }
  catch(err) { opt.log('Error at writeFile():', err) }
}







/**
 *
 */
async function putFileOnGitHub(url, authToken, commitMsg, dataStr, opt = {}) {
  try {
    var res1 = await fetch(url);
    var blob = await res1.json() || {};

    var body = JSON.stringify({
      message:   commitMsg,
      committer: { name: '-', email: '-'},
      author:    { name: '-', email: '-'},
      sha:       blob.sha,
      content:   Buffer.from(dataStr).toString('base64'),
    });

    var res2 = await fetch(
      url,
      { body,
        headers: {
          accept       : 'application/vnd.github.v3+json',
          authorization: 'token ' + authToken,
        },
        method: 'PUT',
      }
    );
    var ans = await res2.json();
    return ans;
  }
  catch(err)  { opt.log(err);  return false; }
}



/**
 *
 */
async function handleCLI(args) {
  var opt  = {
    addQuotes: 0,  addFactors: 1,  addTrades: 0,
    addDD: 1,      addPerfs: 1,    ddAsF: 1,      pfAsF: 1,
    format: 'json',  fromDay: false,  log: console.log
  };
  var fn = { fol:'./',  pre:'',  n:'strat',  p1:'',  p2:'',  p3:'' };

  const arg = s => args.includes(s);
  if (arg('tsv-full'))  args.push('tsv' , 'trades', 'quotes', 'datetime');
  if (arg('tsv-slim'))  args.push('tsv' ,           'limit' , 'datetime');
  if (arg('json-dt' ))  args.push('json', 'trades',           'datetime');
  if (arg('json-git'))  args.push('json', 'trades', 'proxy' , 'commit',
                                                              'transpose');

  if (arg('tsv'     ))  { opt.format = 'tsv';    fn.p1 = 'Sheet'; }
  if (arg('json'    ))  { opt.format = 'json';   fn.p1 = 'Data';  }
  if (arg('json5'   ))  { opt.format = 'json5';  fn.p1 = 'Data';  }
  if (arg('json-git'))                           fn.p1 = 's';
  if (arg('tsv-full'))                           fn.p2 = '-full';
  if (arg('tsv-slim'))                           fn.p2 = '-slim';

  if (arg('quotes'    ))  opt.addQuotes = 1;
  if (arg('trades'    ))  opt.addTrades = 1;
  if (arg('limit'     ))  opt.fromDay   = '180101';
  if (arg('transpose' ))  opt.transpose = 1;

  if (arg('date'    ))  fn.pre = '%DATE%-';      // Note: date-prefix will be..
  if (arg('datetime'))  fn.pre = '%DATETIME%-';  //                   ..in UTC.

  if (arg('order2')) {  // Output bots in a different, 2nd order.
    opt.stratsToGet = uniq([
      'phoe','drag','pega','lion','shee','fox' ,'pand','kang','falc','hipp',
      'dog' ,'tige','deer','rabb','croc','puma','eagl','wolf','ostr','cat' ,
      'rhin','hors','peli','lama','flam','coli','buff','elep','gira','cow' ,
      'lamb','peng','pack','shar',
      ...OptDefault.stratsToGet  // Ensure adding all.
    ]);
    fn.p3 = '-2';
  }

  opt.outputFile = fn.fol + fn.pre + fn.n + (fn.p1||'s') + fn.p2 + fn.p3 +
                     '.' + opt.format;

  if (arg('proxy'))  opt.proxify = proxify;  // Use a proxy to download the data?

  // If needed, put the data on GitHub, using the authToken in arg 'token=___'.
  // + Run via e.g.:
  //     node thisScript.js json-git token=___
  // + Or via crontab, e.g.:
  //     5 * * * * (cd /var/www/mapb && /home/user/.nvm/versions/node/`/bi
  //     n/ls -1 /home/user/.nvm/versions/node | /usr/bin/tail -n 1`/bin/n
  //     ode thisScript.js json-git token=___ silent)
  //
  if (arg('commit') && arg('json')) {
    opt.outputFile = false;
    opt.gitCommit  = {
      url:   'https://api.github.com/repos/mapbots/data/contents/strats.json',
      token: (args.find(s => s.startsWith('token=')) ||'') .slice(6),
    }
  }

  if (arg('silent'))  opt.log = () => {};

  await main(opt);
}




if (require.main === module) {  // Is this file called from the command line?
  var args  = process.argv.slice(2);
  handleCLI(args);
}
