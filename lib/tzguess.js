// Best-effort time zone guesses. Guessed zones are always marked so people can check them.
const AREA_LISTS = {
  'America/New_York': '212 646 917 718 347 929 516 631 914 845 518 585 716 315 607 332 680 838 201 551 609 640 732 848 856 862 908 973 215 267 445 610 484 717 570 412 724 814 878 617 857 339 781 508 774 978 351 413 203 475 860 959 401 603 802 207 302 240 301 410 443 667 202 703 571 757 804 540 434 304 681 704 980 919 984 336 252 828 910 803 843 864 404 470 678 770 762 706 912 478 305 786 954 754 561 407 321 689 813 727 352 386 904 941 239 772 863 216 440 330 234 614 380 513 937 419 567 740 313 248 734 586 810 517 616 269 989 502 859 606 865 423',
  'America/Chicago': '312 773 872 630 708 847 224 815 331 309 217 618 779 464 214 469 972 945 713 281 832 346 210 726 512 737 817 682 903 936 940 956 979 325 361 409 432 414 262 608 715 920 534 612 651 763 952 320 218 507 314 636 816 573 417 660 557 615 629 901 731 931 205 251 256 334 659 938 504 225 318 337 985 405 572 918 539 580 913 316 785 620 402 531 308 515 319 563 641 712 501 870 479 601 662 769 228 701 605',
  'America/Denver': '303 720 719 970 983 801 385 435 505 575 208 986 406 307 915',
  'America/Phoenix': '602 480 623 520 928',
  'America/Los_Angeles': '213 310 323 424 818 747 626 562 661 714 949 657 909 951 760 442 619 858 935 805 831 408 669 650 415 628 510 341 925 707 916 279 530 559 820 206 253 360 425 509 564 503 971 541 458 702 725 775',
};
const AREA = {};
for (const [zone, list] of Object.entries(AREA_LISTS)) list.split(' ').forEach((a) => { AREA[a] = zone; });

const US_STATES = {};
const put = (zone, list) => list.split(' ').forEach((s) => { US_STATES[s] = zone; });
put('America/New_York', 'CT DE DC FL GA ME MD MA NH NJ NY NC OH PA RI SC VT VA WV MI IN KY');
put('America/Chicago', 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI');
put('America/Denver', 'CO ID MT NM UT WY');
put('America/Phoenix', 'AZ');
put('America/Los_Angeles', 'CA NV OR WA');
const AU_STATES = { NSW: 'Australia/Sydney', ACT: 'Australia/Sydney', VIC: 'Australia/Sydney', TAS: 'Australia/Sydney', QLD: 'Australia/Brisbane', SA: 'Australia/Adelaide', WA: 'Australia/Perth' };

const ALIASES = [
  [/eastern|\best\b|\bedt\b|\bet\b|new york/i, 'America/New_York'], [/central|\bcst\b|\bcdt\b|\bct\b|chicago/i, 'America/Chicago'],
  [/arizona|phoenix/i, 'America/Phoenix'], [/mountain|\bmst\b|\bmdt\b|\bmt\b|denver/i, 'America/Denver'],
  [/pacific|\bpst\b|\bpdt\b|\bpt\b|los angeles/i, 'America/Los_Angeles'], [/\buk\b|\bgmt\b|\bbst\b|london|britain/i, 'Europe/London'],
  [/brisbane|queensland|\bqld\b/i, 'Australia/Brisbane'], [/adelaide/i, 'Australia/Adelaide'], [/perth|\bawst\b/i, 'Australia/Perth'],
  [/sydney|melbourne|\baest\b|\baedt\b|\bnsw\b|\bvic\b/i, 'Australia/Sydney'],
];
export function parseZone(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^[A-Za-z]+\/[A-Za-z_]+$/.test(t)) return t;
  for (const [re, zone] of ALIASES) if (re.test(t)) return zone;
  return null;
}

export function guessZone({ phone, country, address }) {
  const digits = String(phone || '').replace(/\D/g, '');
  let c = country;
  if (!c) { if (digits.startsWith('44') && digits.length >= 11) c = 'UK'; else if (digits.startsWith('61') && digits.length >= 10) c = 'AU'; }
  if (c === 'UK') return 'Europe/London';
  const words = String(address || '').match(/\b[A-Z]{2,3}\b/g) || [];
  if (c === 'AU') {
    for (const w of words.reverse()) if (AU_STATES[w]) return AU_STATES[w];
    const area = digits.startsWith('61') ? digits[2] : digits.startsWith('0') ? digits[1] : '';
    return area === '2' || area === '3' ? 'Australia/Sydney' : area === '7' ? 'Australia/Brisbane' : null;
  }
  for (const w of [...words].reverse()) if (US_STATES[w]) return US_STATES[w];
  const us = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits.length === 10 ? digits : '';
  return us ? AREA[us.slice(0, 3)] || null : null;
}
