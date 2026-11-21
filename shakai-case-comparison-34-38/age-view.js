const ageBands = {
  child: {name: '児童', range: '18歳未満'},
  adult: {name: '成人', range: '18〜64歳'},
  older: {name: '高齢者', range: '65歳以上'}
};
const bandKeys = Object.keys(ageBands);

export const ageLabels = {
  stated: '年齢の記載あり', unstated: '年齢の記載なし',
  classified: '利用者の年齢層が分かる問題', family: '家族だけに年齢の記載あり',
  ...Object.fromEntries(Object.entries(ageBands).map(([key, band]) => [key, band.name + '（' + band.range + '）']))
};

export function matchesAge(q, key) {
  const classified = bandKeys.some(band => q.age[band]);
  const stated = classified || Boolean(q.age.family);
  if (key === 'stated') return stated;
  if (key === 'unstated') return !stated;
  if (key === 'classified') return classified;
  return Boolean(q.age[key]);
}

export function ageEvidence(q) {
  const people = bandKeys.filter(band => q.age[band]).map(band => q.age[band]);
  if (people.length) return people.join('、');
  if (q.age.family) return '家族のみ年齢記載：' + q.age.family;
  return '現在の年齢の記載なし';
}

export function ageChart(rows, exams, chartButton) {
  if (!rows.length) return '<p class="empty">この条件に該当する事例問題はありません。</p>';
  const count = (set, key) => set.filter(q => matchesAge(q, key)).length;
  const pct = (n, total) => total ? (100 * n / total).toFixed(1) : '0.0';
  const classified = count(rows, 'classified');
  const family = count(rows, 'family');
  const stated = classified + family;
  const multiple = rows.filter(q => bandKeys.filter(band => q.age[band]).length > 1).length;
  const counts = Object.fromEntries(bandKeys.map(key => [key, count(rows, key)]));
  const high = Math.max(...Object.values(counts));
  const leaders = bandKeys.filter(key => counts[key] === high);
  function drill(key, n, content, kind, round = 0) {
    if (!n) return `<span class="${kind}">${content}</span>`;
    const period = round ? '第' + round + '回' : '全5回';
    return chartButton(period + ' ' + ageLabels[key], round, key, n, kind, '', content);
  }

  const coverage = ['stated','unstated'].map(key => {
    const n = key === 'stated' ? stated : rows.length - stated;
    const label = key === 'stated' ? '記載あり' : '記載なし';
    const content = `<span class="age-dot ${key}" aria-hidden="true"></span>${label} <b>${n}問</b> <small>（${pct(n, rows.length)}%）</small>`;
    return drill(key, n, content, 'age-status');
  }).join('');
  const bars = bandKeys.map(key => {
    const {name, range} = ageBands[key];
    const n = counts[key];
    const rate = pct(n, classified);
    const content = `<span class="age-band-name"><b>${name}</b><small>${range}</small></span>
      <span class="age-track" aria-hidden="true"><i style="width:${rate}%"></i></span>
      <span class="age-band-number"><b>${n}<small>問</small></b> <span>${classified ? rate + '%' : '—'}</span></span>`;
    return drill(key, n, content, 'age-row ' + key);
  }).join('');

  const perRound = exams.map(exam => ({round: exam.round, cases: rows.filter(q => q.round === exam.round)}));
  perRound.push({round: 0, cases: rows});
  const tableRows = ['stated','unstated','classified',...bandKeys].map(key =>
    `<tr><th scope="row">${ageLabels[key]}</th>${perRound.map(({round, cases}) => {
      const n = count(cases, key);
      return `<td>${drill(key, n, String(n), 'age-cell', round)}</td>`;
    }).join('')}</tr>`
  ).join('');
  return `<div class="age-overview">
    <section class="age-coverage" aria-labelledby="age-coverage-heading">
      <h4 id="age-coverage-heading">登場人物の年齢の記載 <small>事例${rows.length}問中</small></h4>
      <div class="age-strip" aria-hidden="true"><i style="width:${pct(stated, rows.length)}%"></i></div>
      <div class="age-status-list">${coverage}</div>
    </section>
    <section class="age-frequency" aria-labelledby="age-frequency-heading">
      <h4 id="age-frequency-heading">${classified ? '最も多いのは <strong>' + leaders.map(key => ageBands[key].name).join('・') + '</strong>' : '利用者の年齢層が分かる問題は0問です'}</h4>
      <p class="age-denominator">利用者の年齢層が分かる<strong>${classified}問</strong>のうち、各年齢層が登場した問題数と割合です。</p>
      <div class="age-bars">${bars}</div>
      ${multiple ? `<p class="age-note">親子など、複数の年齢層が対象の${multiple}問は、該当する各層に1問ずつ数えています。</p>` : ''}
      ${family ? `<p class="age-note">${drill('family', family, '家族だけに年齢の記載がある' + family + '問', 'age-inline')}は、利用者の年齢別集計から除いています。</p>` : ''}
    </section></div>
    <details class="age-detail" open><summary>試験回別の問題数</summary>
      <div class="matrix-scroll" tabindex="0" role="region" aria-label="試験回別の年齢分類">
        <table class="matrix age-table"><thead><tr><th scope="col">分類（問）</th>${exams.map(e => '<th scope="col">第' + e.round + '回</th>').join('')}<th scope="col">合計</th></tr></thead><tbody>${tableRows}</tbody></table>
      </div>
    </details>
    <details class="age-detail"><summary>年齢の数え方</summary>
      <p>事例文と設問に書かれた、登場人物の事例時点の年齢・月齢・年代を確認しました。「高校2年生」「高齢者」などの表現だけの場合は、年齢の記載なしとしました。</p>
      <p>年齢別のグラフでは、相談・支援や制度の適用を問われる人を対象とします。同じ問題に同じ年齢層の人が複数いても1問です。「60歳代前半」は成人に含め、「60歳代」のように65歳をまたぐ表記は、その人の区分を保留しています。</p>
    </details>`;
}
