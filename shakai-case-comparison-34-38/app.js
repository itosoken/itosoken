import {data} from './data.js';
import {classification} from './classification.js';
import {practiceData} from './practice-data.js';
import {goldenNotes} from './golden-notes.js';
import {caseAges} from './case-ages.js';
import {eventKnowledge} from './event-knowledge.js';
import {ageChart, ageEvidence, ageLabels, matchesAge} from './age-view.js';

const {exams, events, groups} = data;
const types = {knowledge: '知識系', response: '対応系（黄金の法則）'};
const breakdownTypes = {
  social: {parent: 'knowledge', label: '社会保障制度'},
  otherKnowledge: {parent: 'knowledge', label: 'それ以外'},
  response: {parent: 'response', label: types.response}
};
const questions = data.questions.map(q => {
  const [category, rationale] = classification[`${q.round}-${q.number}`];
  return {...q, age: caseAges[`${q.round}-${q.number}`], category, rationale, type: breakdownTypes[category].parent};
});
const examFor = new Map(exams.map(exam => [exam.round, exam]));
const eventFor = new Map(events);
const eventIllustrations = {
  birth: {file: 'baby', description: 'この世に生を受ける'},
  ed: {file: 'school', description: '保育園・幼稚園で育ち、小学校・中学校で義務教育を受ける'},
  job: {file: 'university', description: '高校・大学で学び、職業訓練などで働く準備をする'},
  home: {file: 'family', description: '結婚を機にアパートを借り、新しい住まいを確保する'},
  inc: {file: 'earnings', description: '働いて生活費を稼ぐ'},
  health: {file: 'exercise', description: '病気を予防し、健康を保つ'},
  med: {file: 'medical', description: '病気になったら治療を受ける'},
  care: {file: 'care', description: '介護が必要になったら、日々の生活のサポートを受ける'},
  justice: {file: 'reentry', description: '社会復帰のサポートを受ける'},
  right: {file: 'guardian', description: '判断能力が低下したときに、自分の権利を守るための支援を受ける'},
  funeral: {file: 'funeral', description: 'あの世に旅立つための儀式を受ける'},
  x: {file: 'community', description: '地域の相談支援や災害時の支え合いなど'}
};
const domains = {security: '社会保障理解', practice: '仕事理解', other: 'その他'};
const eras = {old: '旧科目', new: '新科目'};
const totals = Object.fromEntries(exams.map(({round}) => [round, questions.filter(q => q.round === round).length]));
const securityTotals = Object.fromEntries(exams.map(({round}) => [round, questions.filter(q => q.round === round && q.domain === 'security').length]));

const $ = selector => document.querySelector(selector);
const requestedView = new URLSearchParams(location.search).get('view');
const viewKeys = ['overview', 'type', 'breakdown', 'age', 'event', 'subject'];
const initial = () => ({
  domain: 'all', type: 'all', view: 'overview', open: null, drill: null, query: '', page: 0,
  units: Object.fromEntries(viewKeys.map(view => [view, view === 'overview' ? 'rate' : 'count']))
});
let state = initial();
// 描画中の切り口。グラフは全切り口を順に描き、問題一覧は最後に選ばれた切り口（state.view）で描く。
let activeView = 'overview';
// トップページには全体・知識系/対応系・ライフイベントの表だけを出し、残りはボタンで開く。
const extraKeys = ['breakdown', 'age', 'guide', 'subject'];
function showExtra() {
  for (const panel of document.querySelectorAll('[data-extra]')) panel.hidden = panel.dataset.extra !== state.open;
  for (const button of document.querySelectorAll('#more-views [data-open]')) {
    button.setAttribute('aria-pressed', String(button.dataset.open === state.open));
  }
}
function openExtra(key) {
  state.open = key;
  showExtra();
  const panel = document.getElementById(`view-${key}`);
  const heading = panel.querySelector('h3');
  heading.tabIndex = -1;
  heading.focus({preventScroll: true});
  panel.scrollIntoView({block: 'start'});
}
const unit = () => state.units[activeView];
const pageSize = 15;
let listedQuestions = [];
let practiceIndex = -1;

function escape(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function start() {
  $('#domain').innerHTML = '<option value="all">すべての分野</option>' + options(domains);
  $('#type').innerHTML = '<option value="all">すべての型</option>' + options(types);
  renderStats();
  renderEventHighlight();
  render();
  if (extraKeys.includes(requestedView)) openExtra(requestedView);
  else if (viewKeys.includes(requestedView)) document.getElementById(`view-${requestedView}`).scrollIntoView({block: 'start'});
}

function options(labels) {
  return Object.entries(labels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
}

function percent(numerator, denominator) {
  return denominator ? 100 * numerator / denominator : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function renderStats() {
  const results = Object.entries(eras).map(([era, label]) => {
    const selected = exams.filter(exam => exam.era === era);
    const caseCount = sum(selected.map(exam => totals[exam.round]));
    const questionCount = sum(selected.map(exam => exam.total));
    const examCount = selected.length;
    return {
      era, label, examCount,
      casesPerExam: caseCount / examCount,
      questionsPerExam: questionCount / examCount,
      rate: percent(caseCount, questionCount)
    };
  });
  const countFormat = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 1});
  function rateCard({era, label, examCount, casesPerExam, questionsPerExam, rate}) {
    return `<dl class="stat ${era}">
      <dt><span class="dot ${era}"></span>${label}の事例割合</dt>
      <dd class="stat-value">${rate.toFixed(1)}<small>%</small></dd>
      <dd class="stat-detail"><span>${countFormat.format(questionsPerExam)}問中</span> <strong>平均${countFormat.format(casesPerExam)}問</strong><br>（${examCount}回分）</dd>
    </dl>`;
  }

  const [before, after] = results;
  $('#trend-rounded').textContent = `約${Math.round(before.rate / 10)}割から約${Math.round(after.rate / 10)}割へ！`;
  $('#trend-gain').textContent = `約${Math.round(after.rate - before.rate)}ポイントアップです。`;
  $('#rates').innerHTML = `
    ${rateCard(before)}
    <span class="rise-arrow" aria-hidden="true"></span>
    ${rateCard(after)}`;

  // 事例の分類：出題傾向と同じく、新科目（直近2回）の平均で示す。
  const recent = exams.filter(exam => exam.era === 'new');
  const recentCases = questions.filter(q => recent.some(exam => exam.round === q.round));
  const rounds = recent.map(exam => exam.round).join('・');
  $('#exam-total').textContent = `直近${recent.length}回（第${rounds}回）の平均`;
  $('#exam-types').innerHTML = Object.keys(types).map(type => {
    const count = recentCases.filter(q => q.type === type).length;
    return `<div class="exam-type ${type}">
      <dt>${type === 'knowledge' ? '知識系' : '対応系'}の事例問題</dt>
      <dd>${percent(count, recentCases.length).toFixed(1)}<small>%</small></dd>
      <dd class="exam-type-detail">事例 平均${countFormat.format(recentCases.length / recent.length)}問中 <strong>平均${countFormat.format(count / recent.length)}問</strong></dd>
    </div>`;
  }).join('');
}

// 出題頻度の高い6つのライフイベントと、社会保険が主に関わる「4大イベント」
const frequentEvents = ['job', 'inc', 'med', 'care', 'justice', 'right'];
const bigFourEvents = ['job', 'inc', 'med', 'care'];
function renderEventHighlight() {
  const security = questions.filter(q => q.domain === 'security');
  const total = security.length;
  const countOf = key => security.filter(q => q.event === key).length;
  const share = count => percent(count, total).toFixed(1);
  const frequentCount = sum(frequentEvents.map(countOf));
  const bigFourCount = sum(bigFourEvents.map(countOf));
  const high = Math.max(...frequentEvents.map(countOf));
  const names = keys => keys.map(key => eventFor.get(key)).join('／');
  $('#event-total').textContent = `社会保障理解の事例 全${total}問`;
  $('#event-highlight').innerHTML = `
    <div class="highlight-lead">
      <p class="highlight-kicker">第34〜38回（5回分）の出題頻度</p>
      <h3>出題の<strong>約${Math.round(percent(frequentCount, total) / 10)}割</strong>は、<strong>6つのライフイベント</strong>から！</h3>
      <p class="highlight-figure"><b>${total}問</b>のうち <b>${frequentCount}問</b><span>（${share(frequentCount)}%）</span></p>
    </div>
    <ul class="highlight-cards">${frequentEvents.map(key => {
      const count = countOf(key);
      const big = bigFourEvents.includes(key);
      return `<li><button type="button" class="highlight-card${big ? ' big-four' : ''}" data-event-study="${key}" aria-haspopup="dialog" aria-controls="event-study" aria-label="${eventFor.get(key)} ${count}問 ${share(count)}% 制度と解答のポイントを見る">
        ${big ? '<span class="big-four-badge">4大イベント</span>' : ''}
        <img src="./assets/life/${eventIllustrations[key].file}.webp" width="64" height="64" alt="" decoding="async">
        <span class="highlight-name">${eventFor.get(key)}</span>
        <span class="highlight-count"><b>${count}</b>問 <small>${share(count)}%</small></span>
        <span class="highlight-track" aria-hidden="true"><i style="width:${percent(count, high)}%"></i></span>
      </button></li>`;
    }).join('')}</ul>
    <div class="big-four-box">
      <div class="big-four-head">
        <p class="big-four-title"><span>社会保険が主に関わる</span><strong>4大イベント</strong></p>
        <p class="big-four-names">${names(bigFourEvents)}</p>
        <p class="big-four-figure"><b>${bigFourCount}問</b><span>（${share(bigFourCount)}%）</span></p>
      </div>
      <div class="big-four-text">
        <p>この4つは、<strong>ほかの制度と関連づけながら</strong>制度が組み立てられているため、<strong>受験生が最も苦手としやすい</strong>ライフイベントです。</p>
        <p class="big-four-point">4大イベントを<strong>体系的に学ぶ</strong>ことが、事例問題攻略のカギ！</p>
      </div>
    </div>
    <p class="highlight-note">割合は「社会保障理解」に分類した事例${total}問に占める割合です。イラストを選ぶと、解答に必要な制度・法律を確認できます。</p>`;
}

function filtered() {
  return questions.filter(q =>
    (state.domain === 'all' || state.domain === q.domain) &&
    (state.type === 'all' || state.type === q.type) &&
    (activeView !== 'event' || q.domain === 'security')
  );
}

function render() {
  showExtra();
  $('#domain').value = state.domain;
  $('#type').value = state.type;
  $('#search').value = state.query;
  for (const section of document.querySelectorAll('.view-section')) {
    activeView = section.dataset.view;
    for (const button of section.querySelectorAll('[data-unit]')) {
      button.setAttribute('aria-pressed', String(button.dataset.unit === unit()));
    }
    renderChart(section);
  }
  activeView = state.view;
  renderList();
}

function denominator(round) {
  if (activeView === 'event') return securityTotals[round];
  if (activeView === 'overview') return examFor.get(round).total;
  return totals[round];
}

function measure(count, denom) {
  return unit() === 'rate' ? percent(count, denom) : count;
}

function format(value) {
  return unit() === 'rate' ? `${value.toFixed(1)}%` : String(value);
}

function chartButton(label, round, key, count, className, style, content) {
  const selected = state.view === activeView && state.drill?.round === round && state.drill?.key === key;
  return `<button type="button" class="${className}" data-view="${activeView}" data-drill="${key}" data-round="${round}" aria-pressed="${selected}" aria-label="${escape(label)} ${count}問の問題一覧" style="${style}">${content}</button>`;
}

function renderChart(section) {
  const labels = {
    overview: ['回次別の事例問題の推移', '割合の分母は各回の全問題数。棒を選ぶと問題一覧に移動します。'],
    type: ['知識系と対応系の推移（第34〜38回）', '割合の分母は各回の全事例数。棒を選ぶと問題一覧に移動します。'],
    breakdown: ['事例問題の分類と内訳', '表の数値を選ぶと問題一覧に移動します。知識系内比は、知識系の2項目の割合です。'],
    age: ['利用者の年齢別にみた出題', '第34〜38回の5回分を集計。数値や棒を選ぶと、根拠となる問題を確認できます。'],
    event: ['ライフイベント別の出題数（第34〜38回）', '項目名やイラストを選ぶと、解答に必要な制度・法律を確認できます。各回の数字を選ぶと該当する問題の一覧が開きます。割合の分母は各回の「社会保障理解」の事例数です。'],
    subject: ['科目系統別の出題', '類似する旧・新科目を同じ系統にまとめました。割合の分母は各回の全事例数です。']
  };
  const [title, note] = labels[activeView];
  const chart = section.querySelector('.chart');
  section.querySelector('h3[id^="chart-title"]').textContent = title;
  section.querySelector('.chart-note').textContent = activeView === 'event' && ['practice', 'other'].includes(state.domain) ?
    `${note} 出題分野を「すべて」か「社会保障理解」に切り替えると表示されます。` : note;
  const rows = filtered();
  if (activeView === 'age') {
    chart.innerHTML = ageChart(rows, exams, chartButton);
    return;
  }
  if (activeView === 'breakdown') {
    chart.innerHTML = breakdownMatrix(rows);
    return;
  }
  chart.innerHTML = activeView === 'overview' || activeView === 'type' ? barChart(rows) : matrix(rows);
}

function barChart(rows) {
  const byType = activeView === 'type';
  const selectedTypes = state.type === 'all' ? Object.keys(types) : [state.type];
  const columns = exams.map(exam => {
    const series = byType ? selectedTypes.map(key => ({key, label: types[key], color: key})) :
      [{key: 'all', label: '事例問題', color: exam.era}];
    const matching = rows.filter(q => q.round === exam.round);
    return {exam, series: series.map(bar => {
      const count = bar.key === 'all' ? matching.length : matching.filter(q => q.type === bar.key).length;
      return {...bar, count, value: measure(count, denominator(exam.round))};
    })};
  });
  const maximum = Math.max(...columns.flatMap(column => column.series.map(bar => bar.value)));
  const quantum = unit() === 'rate' ? 5 : 2;
  const ceiling = Math.max(quantum * 4, Math.ceil((maximum * 1.14) / (quantum * 4)) * quantum * 4);
  const ticks = [0,1,2,3,4].map(i => {
    const suffix = unit() === 'rate' ? '%' : '';
    return `<span style="bottom:${i * 25}%">${i * ceiling / 4}${suffix}</span>`;
  }).join('');
  const legend = Object.entries(byType ? types : eras).map(([key, label]) =>
    `<span><span class="dot ${key}"></span>${label}</span>`).join('');

  return `
    <div class="chart-legend">${legend}</div>
    <div class="plot">
      <div class="plot-axis" aria-hidden="true">${ticks}</div>
      <div class="plot-main">
        <div class="grid-lines" aria-hidden="true"></div>
        <div class="plot-columns" style="--columns:${columns.length}">${columns.map(({exam, series}) => `
          <div class="plot-round">
            <div class="bars">${series.map(({key, label, value, count, color}) => {
              const classes = `bar ${color}${series.length > 1 ? ' dual' : ''}`;
              const style = `--height:${percent(value, ceiling)}%`;
              const text = `<span class="bar-label">${format(value)}</span>`;
              if (!count) return `<span class="${classes}" style="${style}" aria-label="第${exam.round}回 ${label} 0問">${text}</span>`;
              return chartButton(`第${exam.round}回 ${label}`, exam.round, key, count, classes, style, text);
            }).join('')}</div>
            <span class="plot-label ${exam.era}">第${exam.round}回<small>${eras[exam.era]}</small></span>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function classify(q) {
  if (activeView === 'event') return q.event;
  if (activeView === 'subject') return String(examFor.get(q.round).subjects[q.subject].group);
  if (activeView === 'type') return q.type;
  if (activeView === 'breakdown') return q.category;
  return 'all';
}

function matrix(rows) {
  const byEvent = activeView === 'event';
  const dimensions = byEvent ? events : groups.map((label, index) => [String(index), label]);
  const bucket = new Map();
  for (const q of rows) {
    const key = `${q.round}/${classify(q)}`;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  const high = Math.max(1, ...bucket.values());
  const den = sum(exams.map(exam => denominator(exam.round)));
  const legend = byEvent ? '<p class="event-total-legend">ピンクの合計欄は、5回分で11問以上出題された項目です。</p>' : '';
  return `${legend}<div class="matrix-scroll" role="region" tabindex="0" aria-labelledby="chart-title-${activeView}">
  <table class="matrix${byEvent ? ' event-matrix' : ''}" aria-labelledby="chart-title-${activeView}">
    <thead><tr><th scope="col">${byEvent ? 'ライフイベント' : '科目系統'}</th>
      ${exams.map(exam => `<th scope="col">第${exam.round}回<br>${eras[exam.era]}</th>`).join('')}
      <th scope="col">合計</th></tr></thead>
    <tbody>${dimensions.map(([key, label]) => {
      const counts = exams.map(exam => bucket.get(`${exam.round}/${key}`) ?? 0);
      const total = sum(counts);
      const totalClass = byEvent && total > 10 ? ' class="frequent-event-total"' : '';
      const illustration = byEvent && eventIllustrations[key];
      const heading = illustration ? `<button type="button" class="event-label" data-event-study="${key}" aria-haspopup="dialog" aria-controls="event-study" aria-label="${label}の制度と解答のポイントを見る">
        <img src="./assets/life/${illustration.file}.webp" width="56" height="56" alt="" decoding="async">
        <span><span class="event-name">${label}</span><small>${illustration.description}</small></span></button>` : label;
      return `<tr><th scope="row" class="matrix-row-heading">${heading}</th>
        ${exams.map((exam, index) => {
          const count = counts[index];
          const value = format(measure(count, denominator(exam.round)));
          const button = count ? chartButton(`第${exam.round}回 ${label}`, exam.round, key, count, 'cell', `--heat:${.08 + .22 * count / high}`, value) : `<span class="zero">${value}</span>`;
          return `<td>${button}</td>`;
        }).join('')}
        <td${totalClass}>${format(measure(total, den))}</td></tr>`;
    }).join('')}
      <tr><th scope="row">合計</th>${exams.map(exam => `<td><strong>${format(measure(rows.filter(q => q.round === exam.round).length, denominator(exam.round)))}</strong></td>`).join('')}<td>${format(measure(rows.length, den))}</td></tr>
    </tbody>
  </table></div>`;
}

function breakdownMatrix(rows) {
  const forRound = new Map(exams.map(exam => [exam.round, rows.filter(q => q.round === exam.round)]));
  const countFor = (set, category) => set.filter(q => q.category === category).length;
  const totalFor = (set, parent) => set.filter(q => q.type === parent).length;

  function summary(type) {
    const count = totalFor(rows, type);
    const total = rows.length;
    const value = total ? `${percent(count, total).toFixed(1)}<small>%</small>` : '—';
    return `<dl class="breakdown-card ${type}">
      <dt>${types[type]}</dt>
      <dd class="breakdown-number">${value}</dd>
      <dd class="breakdown-denom">${count} / ${total} 問</dd>
    </dl>`;
  }

  function cell(set, category, round) {
    const {parent, label} = breakdownTypes[category];
    if (unit() === 'parent' && parent === 'response') return '<td><span class="zero">—</span></td>';
    const count = countFor(set, category);
    const denominator = unit() === 'parent' ? totalFor(set, parent) : set.length;
    const value = unit() === 'count' ? String(count) : denominator ?
      `${percent(count, denominator).toFixed(1)}%` : '—';
    const roundLabel = round ? `第${round}回` : '全5回 合計';
    const color = `cell breakdown-cell ${category}`;
    return `<td>${count ? chartButton(`${roundLabel} ${label}`, round, category, count, color, '', value) :
      `<span class="zero">${value}</span>`}</td>`;
  }

  function row(category) {
    return `<tr><th scope="row" class="matrix-row-heading">${breakdownTypes[category].label}</th>
      ${exams.map(exam => cell(forRound.get(exam.round), category, exam.round)).join('')}${cell(rows, category, 0)}
    </tr>`;
  }

  return `<div class="breakdown-summary">${summary('knowledge')}${summary('response')}</div>
    <div class="matrix-scroll breakdown-scroll" tabindex="0" aria-label="事例問題の分類と内訳の比較表">
      <table class="matrix breakdown-table">
        <thead><tr><th scope="col">設問の分類</th>${exams.map(exam =>
          `<th scope="col">第${exam.round}回<br>${eras[exam.era]}</th>`).join('')}<th scope="col">合計</th></tr></thead>
        <tbody>
          <tr class="breakdown-group"><th scope="rowgroup" colspan="${exams.length + 2}">${types.knowledge}</th></tr>
          ${row('social')}${row('otherKnowledge')}
        </tbody>
        <tbody>${row('response')}</tbody>
      </table>
    </div>`;
}

function lookupLabel(drill) {
  if (!drill || drill.key === 'all') return '';
  if (activeView === 'age') return ageLabels[drill.key];
  if (activeView === 'event') return eventFor.get(drill.key);
  if (activeView === 'subject') return groups[Number(drill.key)];
  if (activeView === 'breakdown') return breakdownTypes[drill.key]?.label;
  return types[drill.key];
}

function normalize(value) {
  return String(value).normalize('NFKC').toLowerCase();
}

function matchesSearch(q, query) {
  if (!query) return true;
  const number = query.match(/^(?:問題|問)?\s*(\d+)$/u);
  if (number) return q.number === Number(number[1]);
  const exam = examFor.get(q.round);
  const haystack = normalize([
    `第${q.round}回 問${q.number}`, `問題${q.number}`, exam.subjects[q.subject].name,
    activeView === 'age' ? ageEvidence(q) : '', q.title, q.note, q.rationale, types[q.type], breakdownTypes[q.category].label, domains[q.domain], eventFor.get(q.event) ?? ''
  ].join(' '));
  return query.split(/\s+/).every(part => haystack.includes(part));
}

function renderList() {
  const drill = state.drill;
  const query = normalize(state.query).trim();
  const list = filtered().filter(q => {
    if (drill?.round && q.round !== drill.round) return false;
    if (drill && drill.key !== 'all') {
      const inGroup = activeView === 'age' ? matchesAge(q, drill.key) : classify(q) === drill.key;
      if (!inGroup) return false;
    }
    return matchesSearch(q, query);
  });
  listedQuestions = list;
  practiceIndex = -1;
  $('#question-browser').hidden = false;
  $('#practice').hidden = true;
  const count = list.length;
  const maxPage = Math.max(0, Math.ceil(count / pageSize) - 1);
  state.page = Math.min(state.page, maxPage);
  const message = drill ? `${drill.round ? `第${drill.round}回` : '全5回'} ${lookupLabel(drill)}`.trim() : [
    '全5回',
    activeView === 'event' ? 'ライフイベントの対象' : (domains[state.domain] ?? 'すべての分野'),
    types[state.type] ?? ''
  ].filter(Boolean).join(' ／ ');
  $('#result-count').textContent = `${count}問`;
  $('#list-context').innerHTML = `<p>${escape(message)}</p>${drill ? '<button type="button" id="clear-drill" class="muted-button">グラフの選択を解除</button>' : ''}`;
  const start = state.page * pageSize;
  $('#question-list').innerHTML = count ? `<div class="question-wrap"><table class="question-table">
    <thead><tr><th scope="col">問題番号</th><th scope="col">主題・科目</th><th scope="col">出題分野</th><th scope="col">設問の型</th><th scope="col">演習</th></tr></thead>
    <tbody>${list.slice(start, start + pageSize).map(questionRow).join('')}</tbody>
  </table></div>` : '<p class="empty">条件に合う問題がありません。</p>';
  $('#pagination').hidden = maxPage === 0;
  $('#pagination').innerHTML = maxPage ? `
    <button type="button" class="muted-button" data-page="-1" ${state.page === 0 ? 'disabled' : ''}>前のページ</button>
    <span>${start + 1}〜${Math.min(start + pageSize, count)}問目</span>
    <button type="button" class="muted-button" data-page="1" ${state.page === maxPage ? 'disabled' : ''}>次のページ</button>` : '';
}

function questionRow(q) {
  const exam = examFor.get(q.round);
  const subject = exam.subjects[q.subject];
  const key = `${q.round}-${q.number}`;
  const showBreakdown = activeView === 'breakdown';
  const showAge = activeView === 'age';
  const ageInfo = showAge ? `<small class="age-source">${escape(ageEvidence(q))}</small>` : '';
  let reason = showBreakdown ? q.rationale : q.note;
  if (showAge) reason = q.age.note || q.note;
  return `<tr>
    <td class="q-number">第${q.round}回<span>問${q.number}</span></td>
    <td class="q-main"><button type="button" class="q-title" data-practice="${key}">${escape(q.title)}</button><small>${escape(subject.name)}</small>
      ${ageInfo}
      <details><summary>分類の根拠</summary><p>${escape(reason)}</p></details></td>
    <td class="q-class">${domains[q.domain]}${q.event ? `<small>${eventFor.get(q.event)}</small>` : ''}</td>
    <td class="q-type"><span class="type-tag ${q.type}">${types[q.type]}</span>${showBreakdown && q.type === 'knowledge' ? `<span class="question-category">${breakdownTypes[q.category].label}</span>` : ''}</td>
    <td class="q-link">
      <button class="open-practice" type="button" data-practice="${key}" aria-label="第${q.round}回 問${q.number}を解く">問題を解く</button>
    </td>
  </tr>`;
}

function openPractice(index) {
  const q = listedQuestions[index];
  if (!q) return;
  practiceIndex = index;
  const item = practiceData[`${q.round}-${q.number}`];
  const count = item.answer.length;
  const panel = $('#practice');
  $('#question-browser').hidden = true;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="practice-nav"><button type="button" class="practice-back" data-return>‹ 問題一覧に戻る</button>
      <span class="qsize" role="group" aria-label="文字サイズ"><span class="qsize-label">文字サイズ</span>
        ${[['normal', '標準'], ['large', '大'], ['xlarge', '特大']].map(([k, t]) => `<button type="button" data-qsize="${k}" aria-pressed="${k === questionSize}">${t}</button>`).join('')}</span>
      <span>${index + 1} / ${listedQuestions.length} 問</span></div>
    <div class="practice-body">
      <header class="practice-heading">
        <div><h3 id="practice-title" tabindex="-1">第${q.round}回　問${q.number}</h3>
          <p>${escape(examFor.get(q.round).subjects[q.subject].name)}</p></div>
        <div class="practice-tags"><span class="domain-tag">出題分野　${domains[q.domain]}</span>
          <span class="type-tag ${q.type}">${types[q.type]}</span></div>
      </header>
      <section class="practice-case" aria-label="事例"><h4>事例</h4><p>${escape(item.case)}</p></section>
      <p class="practice-prompt">${escape(item.prompt)}</p>
      ${item.note ? `<p class="practice-note">（注）${escape(item.note)}</p>` : ''}
      <form id="answer-form">
        <fieldset class="practice-choices"><legend>${count}つ選んでください</legend>
          ${item.choices.map((choice, i) => `<label class="practice-choice">
            <span class="choice-key">
              <input type="${count === 1 ? 'radio' : 'checkbox'}" name="answer" value="${i + 1}">
              <span class="choice-number">${i + 1}</span>
            </span>
            <span class="choice-text">${escape(choice)}</span>
          </label>`).join('')}
        </fieldset>
        <div class="practice-actions"><button class="practice-primary" type="submit" disabled>解答する</button>
          <span id="choice-count" aria-live="polite">0 / ${count} 選択中</span></div>
      </form>
      <div id="practice-result" hidden></div>
    </div>`;
  $('#practice-title').focus({preventScroll: true});
  panel.scrollIntoView({block: 'start'});
}

function returnToQuestions() {
  const index = practiceIndex;
  const q = listedQuestions[index];
  if (!q) return;
  state.page = Math.floor(index / pageSize);
  renderList();
  const trigger = $(`.open-practice[data-practice="${q.round}-${q.number}"]`);
  trigger.focus({preventScroll: true});
  trigger.scrollIntoView({block: 'center'});
}

$('#question-list').addEventListener('click', event => {
  const button = event.target.closest('[data-practice]');
  if (button) openPractice(listedQuestions.findIndex(q => `${q.round}-${q.number}` === button.dataset.practice));
});
let questionSize = 'large';
try { questionSize = localStorage.getItem('shakaiCaseQuestionSize') || 'large'; } catch (error) { /* 保存できない環境では既定値 */ }
if (!['normal', 'large', 'xlarge'].includes(questionSize)) questionSize = 'large';
$('#practice').dataset.qsize = questionSize;
function setQuestionSize(size) {
  questionSize = size;
  $('#practice').dataset.qsize = size;
  document.querySelectorAll('#practice [data-qsize]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.qsize === size)));
  try { localStorage.setItem('shakaiCaseQuestionSize', size); } catch (error) { /* 保存できなくても表示は切り替える */ }
}
$('#practice').addEventListener('click', event => {
  const sizeButton = event.target.closest('button[data-qsize]');
  if (sizeButton) { setQuestionSize(sizeButton.dataset.qsize); return; }
  if (event.target.closest('[data-return]')) returnToQuestions();
  else if (event.target.closest('[data-next]')) openPractice(practiceIndex + 1);
  else if (event.target.closest('[data-retry]')) openPractice(practiceIndex);
});

function currentPractice() {
  const q = listedQuestions[practiceIndex];
  return practiceData[`${q.round}-${q.number}`];
}

$('#practice').addEventListener('change', event => {
  if (event.target.name !== 'answer') return;
  const form = event.target.form;
  const selected = form.querySelectorAll(':checked').length;
  const count = currentPractice().answer.length;
  form.querySelector('[type="submit"]').disabled = selected !== count;
  $('#choice-count').textContent = `${selected} / ${count} 選択中`;
  if (count > 1) {
    for (const input of form.elements.answer) input.disabled = !input.checked && selected === count;
  }
});
function goldenRuleReview(q, answer) {
  if (q.type !== 'response') return '';
  const key = `${q.round}-${q.number}`;
  const {tip, reasons, expanded} = goldenNotes[key];
  const emphasize = text => escape(text).replace(/「([^「」]+)」/gu, '<strong>「$1」</strong>');
  const rows = reasons.map((reason, index) => {
    const number = index + 1;
    const correct = answer.includes(number);
    return `<li class="reading-row">
      <span class="reading-choice">選択肢 ${number}</span>
      <span class="reading-mark ${correct ? 'suitable' : 'unsuitable'}">${correct ? '○ 適切' : '× 不適切'}</span>
      <span class="reading-reason">${emphasize(reason)}</span>
    </li>`;
  }).join('');
  return `<div class="golden-review">
    <dt>黄金の法則で読む</dt>
    <dd>
      <p class="reading-tip">${emphasize(tip)}</p>
      <details class="reading-details" ${expanded ? 'open' : ''}>
        <summary>5つの選択肢を読み比べる</summary>
        <ol class="reading-list">${rows}</ol>
      </details>
      <details class="reading-guide">
        <summary>黄金の法則の3つの見方</summary>
        <dl class="guide-points">
          <div><dt>美しさの法則</dt><dd>「苦しいのですね」は共感、「よく頑張っていますね」は努力の承認です。相手の思いを聴き、ねぎらう言葉に注目します。「もっと気楽に」「頑張りましょう」は、悩みを軽く扱ったり、努力を求めたりする場合があります。</dd></div>
          <div><dt>表現の法則</dt><dd>「など」「検討する」「確認するよう努める」は選ぶ余地を残す言い方です。「全て」「必ず」「～だけ」「心配ない」と言い切るときは、事例にその根拠があるかを確かめます。</dd></div>
          <div><dt>利用者は神様の法則</dt><dd>「一緒に」「話し合う」は、誰と、何のために行うかを見ます。本人の思いを聴いて選べるようにするのか、周囲で決めた結論に向けて本人を説得するのかを確かめます。</dd></div>
        </dl>
        <p>「関わらない」「委ねる」と、誰の支えが途切れますか。「ご相談ください」と、誰が相談しやすくなりますか。本人の希望や困り事に戻って考えましょう。</p>
      </details>
    </dd>
  </div>`;
}

$('#practice').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const selected = new FormData(form).getAll('answer').map(Number);
  const {answer, point, domainReason} = currentPractice();
  const q = listedQuestions[practiceIndex];
  if (form.querySelector('fieldset').disabled || selected.length !== answer.length) return;
  const correct = answer.every(n => selected.includes(n));
  for (const input of form.elements.answer) {
    const row = input.closest('label');
    const expected = answer.includes(Number(input.value));
    if (expected || input.checked) {
      row.classList.add(expected ? 'is-answer' : 'is-error');
      const marker = document.createElement('strong');
      marker.className = 'choice-mark';
      marker.textContent = expected ? '正答' : '選んだ答え';
      row.append(marker);
    }
    input.disabled = false;
  }
  form.querySelector('fieldset').disabled = true;
  form.querySelector('.practice-actions').hidden = true;
  const result = $('#practice-result');
  result.hidden = false;
  result.innerHTML = `
    <div class="feedback ${correct ? 'correct' : 'incorrect'}">
      <h4 id="feedback-heading" tabindex="-1">${correct ? '正解です' : '不正解です'}</h4>
      <p>あなたの解答　<strong>${selected.join('・')}</strong>　／　正答　<strong>${answer.join('・')}</strong></p>
    </div>
    <dl class="answer-review">
      <div><dt>正答のポイント</dt><dd>${escape(point)}</dd></div>
      ${goldenRuleReview(q, answer)}
      <div><dt>出題分野の分類根拠 <span class="domain-tag">${domains[q.domain]}</span></dt>
        <dd>${escape(domainReason)}</dd></div>
    </dl>
    <div class="result-nav">
      ${practiceIndex + 1 < listedQuestions.length ? '<button type="button" class="practice-primary" data-next>次の問題へ ›</button>' : ''}
      <button type="button" class="muted-button" data-retry>もう一度解く</button>
      <button type="button" class="practice-back" data-return>問題一覧に戻る</button>
    </div>`;
  $('#feedback-heading').focus({preventScroll: true});
  result.scrollIntoView({block: q.type === 'response' ? 'start' : 'nearest'});
});

function changeFilter() {
  state.drill = null;
  state.page = 0;
  render();
}

$('#domain').addEventListener('change', event => {
  state.domain = event.target.value;
  changeFilter();
});
$('#type').addEventListener('change', event => {
  state.type = event.target.value;
  changeFilter();
});
$('#reset').addEventListener('click', () => {
  state = initial();
  render();
});

function openEventStudy(key) {
  const study = eventKnowledge[key];
  const name = eventFor.get(key);
  const examples = filtered().filter(q => q.event === key);
  const allCount = questions.filter(q => q.domain === 'security' && q.event === key).length;
  const filteredList = examples.length !== allCount;
  const rowMarkup = study.rows.map(([scene, topic, law, point, exampleId]) => {
    const example = exampleId && examples.find(q => `${q.round}-${q.number}` === exampleId);
    const practice = example ? `<button type="button" class="study-example" data-study-example="${exampleId}" aria-label="第${example.round}回 問${example.number}を解く">第${example.round}回 問${example.number}を解く</button>` : '';
    return `<tr><td class="study-scene">${escape(scene)}</td>
      <th scope="row">${escape(topic)}<small>${escape(law)}</small></th>
      <td class="study-point">${escape(point)}${practice}</td></tr>`;
  }).join('');
  const examAction = examples.length ?
    `<button type="button" class="study-all" data-study-list>この項目の過去問を見る（${filteredList ? '絞り込み後 ' : ''}${examples.length}問）</button>` :
    `<p class="study-count">${allCount ? '現在の絞り込みに該当する過去問はありません。' : '第34〜38回で、この項目に分類された事例問題は0問です。'}</p>`;
  const dialog = $('#event-study');
  dialog.dataset.event = key;
  $('#event-study-image').src = `./assets/life/${eventIllustrations[key].file}.webp`;
  $('#event-study-title').textContent = `${name}の制度と解答のポイント`;
  $('#event-study-body').innerHTML = `
    <p class="study-cue">${escape(study.cue)}</p>
    <table class="study-table" aria-label="${escape(name)}の学習テーマ">
      <thead><tr><th scope="col">事例の場面</th><th scope="col">制度・法律・知識</th><th scope="col">解答のポイント</th></tr></thead>
      <tbody>${rowMarkup}</tbody>
    </table>
    ${study.note ? `<p class="study-count">${escape(study.note)}</p>` : ''}
    ${examAction}
    <details class="study-sources"><summary>制度を確認できる公的資料</summary>
      <ul>${study.sources.map(([label, url]) => `<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a></li>`).join('')}</ul>
    </details>`;
  dialog.showModal();
  dialog.scrollTop = 0;
  $('#event-study-title').focus({preventScroll: true});
}

$('#event-study-body').addEventListener('click', event => {
  const button = event.target.closest('[data-study-list], [data-study-example]');
  if (!button) return;
  const dialog = $('#event-study');
  const key = dialog.dataset.event;
  dialog.close();
  state.view = 'event';
  state.drill = {round: 0, key};
  state.query = '';
  state.page = 0;
  render();
  if (button.hasAttribute('data-study-example')) {
    const index = listedQuestions.findIndex(q => `${q.round}-${q.number}` === button.dataset.studyExample);
    openPractice(index);
  } else {
    $('#questions-title').tabIndex = -1;
    $('#questions-title').focus({preventScroll: true});
    $('#questions').scrollIntoView({block: 'start'});
  }
});

$('#compare').addEventListener('click', event => {
  const openButton = event.target.closest('button[data-open]');
  if (openButton) {
    openExtra(openButton.dataset.open);
    return;
  }
  const unitButton = event.target.closest('button[data-unit]');
  if (unitButton) {
    state.units[unitButton.closest('.view-section').dataset.view] = unitButton.dataset.unit;
    render();
    return;
  }
  const studyButton = event.target.closest('button[data-event-study]');
  if (studyButton) {
    openEventStudy(studyButton.dataset.eventStudy);
    return;
  }
  const button = event.target.closest('button[data-drill]');
  if (!button) return;
  state.view = button.dataset.view;
  state.drill = {round: Number(button.dataset.round), key: button.dataset.drill};
  state.query = '';
  state.page = 0;
  render();
  const title = $('#questions-title');
  title.tabIndex = -1;
  title.focus({preventScroll: true});
  $('#questions').scrollIntoView({block: 'start'});
});
$('#list-context').addEventListener('click', event => {
  if (event.target.id !== 'clear-drill') return;
  changeFilter();
  $('#search').focus({preventScroll: true});
});
$('#search').addEventListener('input', event => {
  state.query = event.target.value;
  state.page = 0;
  renderList();
});
$('#pagination').addEventListener('click', event => {
  const delta = Number(event.target.closest('button')?.dataset.page);
  if (!delta) return;
  state.page += delta;
  renderList();
  $('#questions').scrollIntoView({block: 'start'});
  $('#pagination').querySelector('button[data-page="' + delta + '"]:not(:disabled)')?.focus({preventScroll: true});
});

start();
