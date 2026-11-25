// Illustrations de la boutique d'avatar, dessinées en SVG (aucun fichier image) : avatars, décors et accessoires.
// Tout est dessiné dans une grille de 100 x 100 avec une tête commune (centre 50,58 ; yeux à 40,56 et 60,56) :
// un accessoire s'ajuste donc sur n'importe quel avatar. Ordre de dessin : décor, avatar, cou, visage, tête.
(function () {
  const INK = '#2a2418';
  const eye = (x, y, r = 3.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + 1.2}" cy="${y - 1.3}" r="1.2" fill="#fff"/>`;
  const eyes = (r) => eye(40, 56, r) + eye(60, 56, r);
  const smile = (y = 68, w = 6.5) => `<path d="M${50 - w} ${y}q${w} ${w * 0.95} ${w * 2} 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  const cheeks = (c = '#ff8fa3') => `<circle cx="31.500" cy="65" r="4.600" fill="${c}" opacity=".5"/><circle cx="68.500" cy="65" r="4.600" fill="${c}" opacity=".5"/>`;
  const shine = '<path d="M31 47a22 22 0 0 1 20-13" stroke="#fff" stroke-opacity=".4" stroke-width="4" fill="none" stroke-linecap="round"/>';
  const body = (c) => `<path d="M14 101q0-21 36-21t36 21z" fill="${c}"/>`;
  const head = (fill, stroke) => `<circle cx="50" cy="58" r="27" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="1.500"` : ''}/>`;

  // ---------- Avatars ----------
  const AVATARS = {
    // Avatar de départ : une bouille aux couleurs de l'enfant (c = [c1, c2], hero = sur fond de carte colorée).
    default: (c, hero) => body(hero ? '#ffffffb0' : c[1]) + head(hero ? '#fff' : c[0]) + (hero ? '' : shine) + eyes() + smile() + cheeks(hero ? '#ff9db0' : '#ffd0d8'),
    cat: () => body('#d9822b')
      + '<polygon points="25,44 27,16 47,32" fill="#f6a24a"/><polygon points="75,44 73,16 53,32" fill="#f6a24a"/><polygon points="30,38 31,24 41,32" fill="#ffb4c0"/><polygon points="70,38 69,24 59,32" fill="#ffb4c0"/>'
      + head('#f6a24a') + shine + '<path d="M44 33l1 6M50 32v7M56 33l-1 6" stroke="#d9822b" stroke-width="2.600" stroke-linecap="round"/>'
      + '<ellipse cx="50" cy="68" rx="11" ry="8" fill="#fde7c8"/>' + eyes() + '<polygon points="46.500,62 53.500,62 50,66" fill="#f0708a"/>'
      + `<path d="M50 66v2.500M44.500 70q5.500 4 5.500-1.500q0 5.500 5.500 1.500" stroke="${INK}" stroke-width="1.800" fill="none" stroke-linecap="round"/>`
      + '<path d="M30 63l-12-2M30 67l-12 3M70 63l12-2M70 67l12 3" stroke="#fff" stroke-width="1.600" stroke-linecap="round" opacity=".9"/>',
    dog: () => body('#a9703d')
      + '<ellipse cx="26" cy="54" rx="9" ry="17" fill="#8a5a33" transform="rotate(14 26 54)"/><ellipse cx="74" cy="54" rx="9" ry="17" fill="#8a5a33" transform="rotate(-14 74 54)"/>'
      + head('#e3b27d') + shine + '<ellipse cx="60" cy="54" rx="8.500" ry="9" fill="#a9703d" opacity=".85"/>' + '<ellipse cx="50" cy="69" rx="12" ry="9" fill="#f7e3c6"/>'
      + eyes() + '<ellipse cx="50" cy="63.500" rx="5" ry="3.600" fill="#2a2418"/><ellipse cx="48.500" cy="62.400" rx="1.500" ry="1" fill="#fff" opacity=".7"/>'
      + `<path d="M50 67v3M44 70q6 5 6 0q0 5 6 0" stroke="${INK}" stroke-width="1.800" fill="none" stroke-linecap="round"/><path d="M47.500 73q2.500 6 5 0z" fill="#ff6f8c"/>`,
    rabbit: () => body('#b79ae8')
      + '<ellipse cx="37" cy="22" rx="7.500" ry="19" fill="#f5f1fa" stroke="#e1d8ee" stroke-width="1.200"/><ellipse cx="63" cy="22" rx="7.500" ry="19" fill="#f5f1fa" stroke="#e1d8ee" stroke-width="1.200"/><ellipse cx="37" cy="24" rx="3.600" ry="13" fill="#ffb7c9"/><ellipse cx="63" cy="24" rx="3.600" ry="13" fill="#ffb7c9"/>'
      + head('#f5f1fa', '#e1d8ee') + eyes() + '<ellipse cx="50" cy="63" rx="3.600" ry="2.600" fill="#f0708a"/>'
      + `<path d="M50 65.500v3.500M44.500 70q5.500 4 5.500-1q0 5 5.500 1" stroke="${INK}" stroke-width="1.800" fill="none" stroke-linecap="round"/><rect x="47.200" y="71.500" width="5.600" height="5" rx="1.500" fill="#fff" stroke="#e1d8ee" stroke-width="1"/>` + cheeks('#ffb7c9'),
    panda: () => body('#3a3a46')
      + '<circle cx="29" cy="35" r="9.500" fill="#2f2f3a"/><circle cx="71" cy="35" r="9.500" fill="#2f2f3a"/>'
      + head('#fff', '#e4e4ea') + '<ellipse cx="39.500" cy="56" rx="7.500" ry="9.500" fill="#2f2f3a" transform="rotate(18 39.500 56)"/><ellipse cx="60.500" cy="56" rx="7.500" ry="9.500" fill="#2f2f3a" transform="rotate(-18 60.500 56)"/>'
      + '<circle cx="39.500" cy="56" r="3.300" fill="#fff"/><circle cx="60.500" cy="56" r="3.300" fill="#fff"/><circle cx="40" cy="56.300" r="2" fill="#2f2f3a"/><circle cx="60" cy="56.300" r="2" fill="#2f2f3a"/>'
      + '<ellipse cx="50" cy="65" rx="4.200" ry="3" fill="#2f2f3a"/>' + `<path d="M43.500 70q6.500 5 13 0" stroke="${INK}" stroke-width="2.200" fill="none" stroke-linecap="round"/>` + cheeks('#ffb2c1'),
    fox: () => body('#d9731a')
      + '<polygon points="24,46 27,14 48,32" fill="#f28c28"/><polygon points="76,46 73,14 52,32" fill="#f28c28"/><polygon points="29,36 28,21 40,31" fill="#2f2420"/><polygon points="71,36 72,21 60,31" fill="#2f2420"/>'
      + head('#f28c28') + shine + '<path d="M23 64Q50 56 77 64Q72 86 50 86Q28 86 23 64Z" fill="#fff6ec"/>' + eyes() + '<ellipse cx="50" cy="66" rx="4" ry="3" fill="#2a2418"/>'
      + `<path d="M50 69v2M45 72q5 4 5 0q0 4 5 0" stroke="${INK}" stroke-width="1.800" fill="none" stroke-linecap="round"/>`,
    robot: () => body('#6d7a96')
      + '<line x1="50" y1="33" x2="50" y2="21" stroke="#6d7a96" stroke-width="3"/><circle cx="50" cy="19" r="4.600" fill="#ff5a5f"/><circle cx="48.800" cy="17.800" r="1.400" fill="#fff" opacity=".8"/>'
      + '<rect x="19" y="52" width="7" height="14" rx="3" fill="#6d7a96"/><rect x="74" y="52" width="7" height="14" rx="3" fill="#6d7a96"/>'
      + '<rect x="23" y="32" width="54" height="50" rx="14" fill="#b4bfd6" stroke="#8793ae" stroke-width="1.500"/><rect x="29" y="43" width="42" height="26" rx="9" fill="#1f2a44"/>'
      + '<circle cx="40" cy="56" r="6.500" fill="#5ee6ff"/><circle cx="60" cy="56" r="6.500" fill="#5ee6ff"/><circle cx="40" cy="56" r="3" fill="#fff" opacity=".9"/><circle cx="60" cy="56" r="3" fill="#fff" opacity=".9"/>'
      + '<rect x="40" y="73" width="20" height="5" rx="2.500" fill="#6d7a96"/><path d="M44 73v5M48 73v5M52 73v5M56 73v5" stroke="#b4bfd6" stroke-width="1.200"/>'
      + '<path d="M28 38q12-5 24-5" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>',
    unicorn: () => body('#d9a6e8')
      + '<path d="M26 36Q8 48 14 72Q18 60 26 58Z" fill="#ff8ac5"/><path d="M24 44Q10 58 20 78Q22 64 28 62Z" fill="#a98bff"/><path d="M30 34Q14 38 12 56Q20 48 30 46Z" fill="#6ed3ff"/>'
      + '<path d="M74 36Q92 48 86 72Q82 60 74 58Z" fill="#ff8ac5"/><path d="M76 44Q90 58 80 78Q78 64 72 62Z" fill="#a98bff"/><path d="M70 34Q86 38 88 56Q80 48 70 46Z" fill="#6ed3ff"/>'
      + '<polygon points="27,40 29,22 43,33" fill="#fff"/><polygon points="73,40 71,22 57,33" fill="#fff"/><polygon points="31,36 31,27 38,33" fill="#ffc2dc"/>'
      + head('#fff8fc', '#ecd9f2') + '<polygon points="43.500,34 56.500,34 50,6" fill="#ffd34d" stroke="#f0a800" stroke-width="1.400" stroke-linejoin="round"/><path d="M45 29.500l10-3M46.500 24l7-2M48 18.500l4-1.200" stroke="#f0a800" stroke-width="1.400" stroke-linecap="round"/>'
      + '<path d="M44 36q-4 4-7 3q4-6 7-9zM56 36q4 4 7 3q-4-6-7-9z" fill="#ff8ac5"/>'
      + eye(40, 57) + eye(60, 57) + '<path d="M35.500 53l-3-2M64.500 53l3-2" stroke="#2a2418" stroke-width="1.600" stroke-linecap="round"/>' + smile(68.500, 5.500) + cheeks('#ffb2d6'),
    dragon: () => body('#2f9d62')
      + '<polygon points="30,36 24,14 42,29" fill="#f6dc9a"/><polygon points="70,36 76,14 58,29" fill="#f6dc9a"/><polygon points="44,32 50,16 56,32" fill="#25a96b"/>'
      + '<path d="M18 62l-8-6 10-1zM82 62l8-6-10-1z" fill="#25a96b"/>'
      + head('#4cc97a') + shine + '<ellipse cx="50" cy="69" rx="14" ry="10" fill="#9be8ba"/>'
      + '<ellipse cx="40" cy="56" rx="5.200" ry="4.600" fill="#ffe36b"/><ellipse cx="60" cy="56" rx="5.200" ry="4.600" fill="#ffe36b"/><ellipse cx="40" cy="56" rx="1.700" ry="3.800" fill="#2a2418"/><ellipse cx="60" cy="56" rx="1.700" ry="3.800" fill="#2a2418"/>'
      + '<circle cx="45.500" cy="66" r="1.500" fill="#2f9d62"/><circle cx="54.500" cy="66" r="1.500" fill="#2f9d62"/>' + `<path d="M43 72q7 5 14 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/><polygon points="45,72.500 47,76 49,73" fill="#fff"/><polygon points="55,72.500 53,76 51,73" fill="#fff"/>`,
  };

  // ---------- Accessoires ----------
  const ACC = {
    // tête
    cap: '<path d="M27 46Q27 22 50 22T73 46Z" fill="#3b82f6"/><path d="M50 22Q40 24 36 46H27Q27 22 50 22Z" fill="#fff" opacity=".18"/><path d="M48 44H84q6 0 6 5Q70 53 48 49Z" fill="#2563eb"/><circle cx="50" cy="21.500" r="3" fill="#2563eb"/><rect x="27" y="42" width="46" height="4" fill="#fff" opacity=".85"/>',
    crown: '<path d="M29 40L32 17L43 29L50 12L57 29L68 17L71 40Z" fill="#ffc83d" stroke="#e09b00" stroke-width="1.800" stroke-linejoin="round"/><rect x="29" y="36" width="42" height="7" rx="2" fill="#ffb300" stroke="#e09b00" stroke-width="1.400"/><circle cx="32" cy="16" r="2.800" fill="#ff5a5f"/><circle cx="50" cy="11" r="3" fill="#5ee6ff"/><circle cx="68" cy="16" r="2.800" fill="#ff5a5f"/><circle cx="41" cy="39.500" r="2" fill="#a98bff"/><circle cx="59" cy="39.500" r="2" fill="#a98bff"/><circle cx="50" cy="39.500" r="2" fill="#4cc97a"/>',
    beanie: '<path d="M27 44Q27 22 50 22T73 44Z" fill="#ef4444"/><path d="M36 25v18M44 23v20M52 22.500v21M60 23v20M67 26v17" stroke="#b91c1c" stroke-width="1.600" opacity=".55"/><rect x="25" y="39" width="50" height="10" rx="5" fill="#fca5a5" stroke="#f87171" stroke-width="1"/><circle cx="50" cy="17" r="7" fill="#fff" stroke="#e5e7eb" stroke-width="1.200"/>',
    wizard: '<ellipse cx="50" cy="42" rx="31" ry="7" fill="#5b3ed6"/><path d="M30 42Q38 24 47 6Q52 5 53 8Q62 26 70 42Z" fill="#7c5cff"/><path d="M33 40Q40 24 47 8" stroke="#fff" stroke-opacity=".28" stroke-width="3" fill="none"/><rect x="31" y="36" width="38" height="6" fill="#ffd34d" opacity=".95"/><polygon points="52,22 53.500,26 58,26 54.500,28.800 56,33 52,30.500 48,33 49.500,28.800 46,26 50.500,26" fill="#ffd34d"/><circle cx="43" cy="30" r="1.800" fill="#ffd34d"/><circle cx="60" cy="19" r="1.500" fill="#ffd34d"/>',
    pirate: '<path d="M22 44Q26 20 50 20Q74 20 78 44Q64 38 50 38Q36 38 22 44Z" fill="#26262e"/><path d="M26 38Q50 30 74 38" stroke="#ffd34d" stroke-width="2.200" fill="none"/><path d="M22 44Q36 36 50 36Q64 36 78 44Q64 48 50 46Q36 48 22 44Z" fill="#3a3a46"/><circle cx="50" cy="29" r="5.500" fill="#fff"/><rect x="46.800" y="32" width="6.400" height="3.600" rx="1" fill="#fff"/><circle cx="48" cy="28.500" r="1.400" fill="#26262e"/><circle cx="52" cy="28.500" r="1.400" fill="#26262e"/>',
    flowers: '<path d="M26 44Q50 20 74 44" stroke="#3f9d5d" stroke-width="3.200" fill="none" stroke-linecap="round"/>'
      + [[28, 41, '#ff8ac5'], [38, 31.500, '#ffd34d'], [50, 27.500, '#ff6f91'], [62, 31.500, '#c4a4ff'], [72, 41, '#ff8ac5']].map(([x, y, c]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<circle cx="${(4.600 * Math.cos(a * Math.PI / 180)).toFixed(2)}" cy="${(4.600 * Math.sin(a * Math.PI / 180)).toFixed(2)}" r="3.300" fill="${c}"/>`).join('')}<circle r="2.600" fill="#fff6c2"/></g>`).join('')
      + '<path d="M33 38q2-4 5-4M56 30q3 0 5 3" stroke="#3f9d5d" stroke-width="2" fill="none" stroke-linecap="round"/>',
    headphones: '<path d="M23 60Q22 24 50 24Q78 24 77 60" stroke="#374151" stroke-width="5.500" fill="none" stroke-linecap="round"/><path d="M26 52Q30 30 50 29" stroke="#fff" stroke-opacity=".25" stroke-width="2" fill="none"/><rect x="15" y="50" width="12" height="20" rx="6" fill="#ef4444" stroke="#b91c1c" stroke-width="1.400"/><rect x="73" y="50" width="12" height="20" rx="6" fill="#ef4444" stroke="#b91c1c" stroke-width="1.400"/><rect x="18" y="55" width="4" height="10" rx="2" fill="#fff" opacity=".3"/><rect x="78" y="55" width="4" height="10" rx="2" fill="#fff" opacity=".3"/>',
    // visage
    glasses: '<circle cx="40" cy="56" r="10.500" fill="#cfe9ff" fill-opacity=".35" stroke="#2a2418" stroke-width="2.800"/><circle cx="60" cy="56" r="10.500" fill="#cfe9ff" fill-opacity=".35" stroke="#2a2418" stroke-width="2.800"/><path d="M50.500 55q-.5-2-1 0M29.500 54L23 51M70.500 54L77 51" stroke="#2a2418" stroke-width="2.600" fill="none" stroke-linecap="round"/><path d="M33 51q3-3 7-3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/>',
    sunglasses: '<path d="M27 51H73Q73 52 72 58Q69 68 60 67Q52 66 50.500 57Q50 55 49.500 57Q48 66 40 67Q31 68 28 58Q27 52 27 51Z" fill="#1f2937"/><path d="M27 51L21 49M73 51L79 49" stroke="#1f2937" stroke-width="3" stroke-linecap="round"/><path d="M32 54l7-1.500M55 54l7-1.500" stroke="#fff" stroke-opacity=".5" stroke-width="2.200" stroke-linecap="round"/><rect x="27" y="49.500" width="46" height="3.600" rx="1.800" fill="#374151"/>',
    mask: '<path d="M23 49Q50 40 77 49Q80 63 68 66Q59 67 54 60Q50 57 46 60Q41 67 32 66Q20 63 23 49Z" fill="#e11d48"/><path d="M26 49Q50 42 74 49" stroke="#fff" stroke-opacity=".3" stroke-width="2" fill="none"/><ellipse cx="39.500" cy="56" rx="6.800" ry="5.800" fill="#fff"/><ellipse cx="60.500" cy="56" rx="6.800" ry="5.800" fill="#fff"/><circle cx="40" cy="56.500" r="3.400" fill="#2a2418"/><circle cx="60" cy="56.500" r="3.400" fill="#2a2418"/><circle cx="41.200" cy="55.300" r="1.100" fill="#fff"/><circle cx="61.200" cy="55.300" r="1.100" fill="#fff"/><path d="M23 49L14 44M77 49L86 44" stroke="#e11d48" stroke-width="3" stroke-linecap="round"/>',
    bolt: '<polygon points="71,56 65,67 70,67 66,77 77,64 71.500,64 75,56" fill="#ffd23f" stroke="#f0a800" stroke-width="1.400" stroke-linejoin="round"/>',
    mustache: '<path d="M50 66.500Q44 62 36.500 66.500Q31 70 34 74Q37 70 43.500 70Q47 70 50 68.500Q53 70 56.500 70Q63 70 66 74Q69 70 63.500 66.500Q56 62 50 66.500Z" fill="#5b3a1e" stroke="#3b2412" stroke-width="1"/><path d="M40 67q3-1.500 6 0M54 67q3-1.500 6 0" stroke="#fff" stroke-opacity=".3" stroke-width="1.200" stroke-linecap="round"/>',
    // cou
    bowtie: '<path d="M50 88L37 80V96Z" fill="#ef4444" stroke="#b91c1c" stroke-width="1.200" stroke-linejoin="round"/><path d="M50 88L63 80V96Z" fill="#ef4444" stroke="#b91c1c" stroke-width="1.200" stroke-linejoin="round"/><rect x="46.200" y="83.500" width="7.600" height="9" rx="3" fill="#dc2626" stroke="#b91c1c" stroke-width="1.200"/><circle cx="41" cy="88" r="1.200" fill="#fff" opacity=".7"/><circle cx="59" cy="88" r="1.200" fill="#fff" opacity=".7"/>',
    scarf: '<path d="M24 81Q50 95 76 81V91Q50 105 24 91Z" fill="#22c55e" stroke="#15803d" stroke-width="1.200"/><path d="M34 85v10M43 88v10M52 89v10M61 88v10M69 86v9" stroke="#bbf7d0" stroke-width="2.600" opacity=".9"/><path d="M60 92h13l1 15H59Z" fill="#22c55e" stroke="#15803d" stroke-width="1.200"/><path d="M60 98h14M60.500 102.500h14" stroke="#bbf7d0" stroke-width="2.200"/>',
    medal: '<path d="M38 80L50 94L62 80" stroke="#3b82f6" stroke-width="5" fill="none" stroke-linejoin="round"/><circle cx="50" cy="95" r="7.500" fill="#ffc83d" stroke="#e09b00" stroke-width="1.600"/><polygon points="50,90 51.700,93.400 55.400,93.800 52.700,96.300 53.400,100 50,98.200 46.600,100 47.300,96.300 44.600,93.800 48.300,93.400" fill="#fff6c2"/>',
  };

  // ---------- Décors (carré 100 x 100) ----------
  const grad = (id, a, b, vertical = true) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 1}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
  const cloud = (x, y, s = 1, o = 1) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><ellipse cx="0" cy="0" rx="13" ry="6" fill="#fff"/><circle cx="-5" cy="-4" r="6" fill="#fff"/><circle cx="4" cy="-6" r="7.500" fill="#fff"/></g>`;
  const star = (x, y, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`;
  const SCENES = {
    sky: grad('sc-sky', '#5bb8ff', '#d8f0ff') + '<rect width="100" height="100" fill="url(#sc-sky)"/>' + cloud(24, 24, 1.100) + cloud(76, 38, 0.900, 0.95) + cloud(40, 62, 0.800, 0.85) + '<circle cx="82" cy="16" r="7" fill="#fff6a8"/>',
    beach: grad('sc-beach-sky', '#7fd0ff', '#d5f2ff') + '<rect width="100" height="100" fill="url(#sc-beach-sky)"/><circle cx="78" cy="22" r="9" fill="#ffd34d"/><circle cx="78" cy="22" r="13" fill="#ffd34d" opacity=".25"/>'
      + '<rect y="52" width="100" height="22" fill="#2fb6d8"/><path d="M0 58q8-4 16 0t16 0t16 0t16 0t16 0t16 0" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none"/><path d="M0 66q8-4 16 0t16 0t16 0t16 0t16 0t16 0" stroke="#fff" stroke-opacity=".35" stroke-width="2" fill="none"/>'
      + '<path d="M0 74Q50 64 100 74V100H0Z" fill="#f6d9a0"/><path d="M12 88h6M70 92h8M44 84h5" stroke="#e8c27a" stroke-width="2" stroke-linecap="round"/>' + cloud(26, 24, 0.900),
    forest: grad('sc-forest', '#b7ecc0', '#e9fbd9') + '<rect width="100" height="100" fill="url(#sc-forest)"/>'
      + [[14, 62, 14, '#2f9d62'], [34, 56, 18, '#25834f'], [58, 60, 15, '#2f9d62'], [82, 54, 19, '#25834f']].map(([x, y, h, c]) => `<polygon points="${x},${y - h} ${x - h * 0.55},${y} ${x + h * 0.55},${y}" fill="${c}"/><polygon points="${x},${y - h * 0.62} ${x - h * 0.7},${y + h * 0.22} ${x + h * 0.7},${y + h * 0.22}" fill="${c}"/><rect x="${x - 2}" y="${y + h * 0.2}" width="4" height="8" fill="#7a5230"/>`).join('')
      + '<path d="M0 76Q30 68 60 76T100 72V100H0Z" fill="#6cc070"/><path d="M0 86Q40 80 100 88V100H0Z" fill="#4fa95a"/><circle cx="84" cy="18" r="7" fill="#fff6a8"/>',
    mountain: grad('sc-mount', '#8fc8ff', '#eaf6ff') + '<rect width="100" height="100" fill="url(#sc-mount)"/><circle cx="24" cy="22" r="8" fill="#fff3a8"/>'
      + '<polygon points="0,78 30,34 60,78" fill="#8795b3"/><polygon points="30,34 37,44 30,41 24,45" fill="#fff"/><polygon points="38,78 68,24 100,78" fill="#6b7a9b"/><polygon points="68,24 77,38 68,34 60,40" fill="#fff"/>'
      + '<path d="M0 78H100V100H0Z" fill="#7bc47f"/><path d="M0 88Q50 80 100 90V100H0Z" fill="#5fae6a"/>' + cloud(70, 14, 0.700),
    city: grad('sc-city', '#1c2455', '#5a4a9a') + '<rect width="100" height="100" fill="url(#sc-city)"/><circle cx="76" cy="20" r="8" fill="#fff6c8"/><circle cx="72" cy="18" r="7" fill="#3a3478" opacity=".35"/>'
      + [star(16, 14), star(32, 26, 0.800), star(50, 12), star(60, 30, 0.800), star(88, 40, 0.800), star(8, 40, 0.800)].join('')
      + [[4, 56, 14, 44], [18, 46, 16, 54], [34, 60, 12, 40], [46, 42, 16, 58], [62, 54, 14, 46], [76, 48, 12, 52], [88, 58, 14, 42]].map(([x, y, w, h], i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${i % 2 ? '#2a2f66' : '#232857'}"/>${[0, 1, 2, 3].map((r) => [0, 1].map((c) => ((r + c + i) % 3 ? `<rect x="${x + 2.5 + c * (w / 2 - 1)}" y="${y + 4 + r * 9}" width="3.500" height="4" fill="#ffd96a"/>` : '')).join('')).join('')}`).join(''),
    rainbow: grad('sc-rainbow', '#bfe6ff', '#f4fbff') + '<rect width="100" height="100" fill="url(#sc-rainbow)"/>'
      + ['#ff5a5f', '#ff9f43', '#ffd34d', '#4cc97a', '#4da6ff', '#9b6bff'].map((c, i) => `<path d="M${6 + i * 4.500} 82A${44 - i * 4.500} ${44 - i * 4.500} 0 0 1 ${94 - i * 4.500} 82" stroke="${c}" stroke-width="4.600" fill="none"/>`).join('')
      + cloud(14, 84, 1.200) + cloud(86, 84, 1.200) + cloud(50, 16, 0.700, 0.9),
    party: grad('sc-party', '#ff7ab8', '#a98bff', false) + '<rect width="100" height="100" fill="url(#sc-party)"/>'
      + '<path d="M0 0L18 0L9 22Z" fill="#ffd34d"/><path d="M18 0L36 0L27 18Z" fill="#4cc97a"/><path d="M64 0L82 0L73 18Z" fill="#4da6ff"/><path d="M82 0L100 0L91 22Z" fill="#ff5a5f"/>'
      + [[14, 36, 24, '#ffd34d'], [84, 40, -30, '#5ee6ff'], [26, 78, 40, '#fff'], [74, 76, -20, '#ffd34d'], [50, 20, 10, '#fff'], [90, 66, 60, '#4cc97a'], [8, 62, -50, '#5ee6ff'], [60, 90, 30, '#ff5a5f'], [40, 8, -30, '#5ee6ff']].map(([x, y, r, c]) => `<rect x="${x - 3.500}" y="${y - 1.500}" width="7" height="3" rx="1.200" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`).join('')
      + '<circle cx="20" cy="56" r="2.200" fill="#ffd34d"/><circle cx="82" cy="24" r="2.200" fill="#fff"/><circle cx="70" cy="88" r="2" fill="#5ee6ff"/><circle cx="34" cy="30" r="1.800" fill="#fff"/>',
    space: grad('sc-space', '#0b0f2e', '#2a1b5c') + '<rect width="100" height="100" fill="url(#sc-space)"/>'
      + [[10, 12], [24, 30], [40, 10], [56, 24], [70, 8], [88, 30], [92, 56], [8, 54], [30, 88], [64, 92], [80, 78], [48, 40]].map(([x, y], i) => star(x, y, i % 3 ? 0.9 : 1.500)).join('')
      + '<circle cx="76" cy="26" r="11" fill="#ff9f6e"/><ellipse cx="76" cy="26" rx="19" ry="4.600" fill="none" stroke="#ffd9a8" stroke-width="2.200" transform="rotate(-18 76 26)"/><path d="M68 22a11 11 0 0 1 16-3" stroke="#fff" stroke-opacity=".35" stroke-width="2" fill="none"/>'
      + '<circle cx="20" cy="78" r="6" fill="#c9d3ff"/><circle cx="18" cy="76" r="1.500" fill="#9fb0f5"/><circle cx="23" cy="80" r="1.100" fill="#9fb0f5"/>',
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Avatar complet d'un enfant. k = { name, palette, look }, pal = [c1, c2] de sa couleur, size en pixels.
  // opts.hero : posé sur une carte colorée (fond translucide, tête blanche par défaut).
  function kidArt(k, size, pal, opts = {}) {
    const look = { ...(k.look || {}), ...(opts.look || {}) };
    const bg = look.scene && SCENES[look.scene] ? SCENES[look.scene] : `<rect width="100" height="100" fill="${opts.hero ? '#ffffff2e' : pal[0] + '26'}"/>`;
    const av = look.avatar && AVATARS[look.avatar] ? AVATARS[look.avatar]() : AVATARS.default(pal, opts.hero && !look.scene);
    const layer = (slot) => (look[slot] && ACC[look[slot]] ? ACC[look[slot]] : '');
    return `<span class="kav" style="--s:${size}px"><svg viewBox="0 0 100 100" role="img" aria-label="${esc('Avatar de ' + (k.name || ''))}">${bg}${av}${layer('neck')}${layer('face')}${layer('head')}</svg></span>`;
  }
  const ART = { kidArt, AVATARS, ACC, SCENES };
  if (typeof module !== 'undefined' && module.exports) module.exports = ART;
  else window.ART = ART;
}());
