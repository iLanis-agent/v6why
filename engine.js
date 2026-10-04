(function (root) {
  'use strict';
  // IPv6 text parsing (RFC 4291 2.2), canonical text (RFC 5952), classification (IANA special-purpose blocks).
  function parseV4(s) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
    if (!m) return null;
    var o = [];
    for (var i = 1; i <= 4; i++) { if (m[i].length > 1 && m[i][0] === '0') return null; var v = +m[i]; if (v > 255) return null; o.push(v); }
    return o;
  }
  function parse(input) {
    var s = String(input).trim(), zone = null, prefix = null, port = null, bracket = false, m;
    if ((m = /^\[(.*)\]:(\d+)$/.exec(s))) { s = m[1]; port = +m[2]; bracket = true; if (port > 65535) return { ok: false, error: 'Port ' + port + ' is above 65535.' }; }
    else if ((m = /^\[(.*)\]$/.exec(s))) { s = m[1]; bracket = true; }
    if ((m = /^(.*)\/(\d+)$/.exec(s))) { s = m[1]; prefix = +m[2]; if (prefix > 128) return { ok: false, error: 'Prefix length ' + prefix + ' is above 128.' }; }
    if ((m = /^(.*)%(.+)$/.exec(s))) { s = m[1]; zone = m[2]; }
    if (s === '') return { ok: false, error: 'Empty address.' };
    if (s.indexOf(':') < 0) return { ok: false, error: 'No colons. An IPv6 address has groups separated by ":".' };
    if (/:::/.test(s)) return { ok: false, error: 'Three colons in a row. "::" may appear once and only as two colons.' };
    var dbl = s.split('::');
    if (dbl.length > 2) return { ok: false, error: 'More than one "::". It may be used only once.' };
    function side(t, last) {
      if (t === '') return { g: [] };
      var parts = t.split(':'), out = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p === '') return { err: 'Empty group (a stray ":"). A lone leading or trailing colon is not allowed.' };
        if (p.indexOf('.') >= 0) {
          if (!(last && i === parts.length - 1)) return { err: 'A dotted IPv4 part is only allowed at the very end.' };
          var v4 = parseV4(p);
          if (!v4) return { err: '"' + p + '" is not a valid dotted IPv4 address (four numbers 0-255, no leading zeros).' };
          out.push(v4[0] * 256 + v4[1], v4[2] * 256 + v4[3]); continue;
        }
        if (!/^[0-9a-fA-F]+$/.test(p)) return { err: 'Group "' + p + '" has a character that is not a hex digit.' };
        if (p.length > 4) return { err: 'Group "' + p + '" has more than 4 hex digits.' };
        out.push(parseInt(p, 16));
      }
      return { g: out };
    }
    var a = side(dbl[0], dbl.length === 1), b;
    if (a.err) return { ok: false, error: a.err };
    var groups, hadDouble = dbl.length === 2, zeroRun = null;
    if (!hadDouble) {
      if (a.g.length !== 8) return { ok: false, error: a.g.length < 8 ? 'Only ' + a.g.length + ' groups. Without "::" you need exactly 8.' : 'Too many groups (' + a.g.length + '). An address has 8.' };
      groups = a.g;
    } else {
      b = side(dbl[1], true);
      if (b.err) return { ok: false, error: b.err };
      var n = a.g.length + b.g.length;
      if (n > 7) return { ok: false, error: n === 8 ? '"::" must replace at least one group of zeros, but all 8 groups are already written.' : 'Too many groups (' + n + ') around "::".' };
      var fill = 8 - n; groups = a.g.concat(new Array(fill).fill(0), b.g); zeroRun = [a.g.length, fill];
    }
    return { ok: true, groups: groups, zone: zone, prefix: prefix, port: port, bracket: bracket, hadDouble: hadDouble, written: zeroRun };
  }
  function hex(g) { return g.toString(16); }
  function canonical(groups) {
    var best = -1, bl = 0, i = 0, j;
    while (i < 8) { if (groups[i] === 0) { j = i; while (j < 8 && groups[j] === 0) j++; if (j - i > bl) { bl = j - i; best = i; } i = j; } else i++; }
    if (bl < 2) return groups.map(hex).join(':');   // RFC 5952 4.2.2: never shorten a single 0 group
    var L = groups.slice(0, best).map(hex).join(':'), R = groups.slice(best + bl).map(hex).join(':');
    return L + '::' + R;
  }
  function expanded(groups) { return groups.map(function (g) { return ('0000' + hex(g)).slice(-4); }).join(':'); }
  function reversePtr(groups) { return expanded(groups).replace(/:/g, '').split('').reverse().join('.') + '.ip6.arpa'; }
  function bits(groups) { return groups.map(function (g) { return ('0000000000000000' + g.toString(2)).slice(-16); }).join(''); }
  function v4of(a, b) { return (a >> 8) + '.' + (a & 255) + '.' + (b >> 8) + '.' + (b & 255); }
  function inPrefix(groups, prefixGroups, len) { var x = bits(groups), y = bits(prefixGroups); return x.slice(0, len) === y.slice(0, len); }
  function classify(g) {
    var out = [], all0 = g.every(function (x) { return x === 0; });
    if (all0) return { kind: 'Unspecified (::)', notes: ['Means "no address". Never a destination.'], flags: { unspecified: true } };
    var f = { loopback: false, mapped: false, linklocal: false, ula: false, multicast: false, sixtofour: null, teredo: null };
    if (g.slice(0, 7).every(function (x) { return x === 0; }) && g[7] === 1) return { kind: 'Loopback (::1)', notes: ['This host only.'], flags: { loopback: true } };
    if (g.slice(0, 5).every(function (x) { return x === 0; }) && g[5] === 0xffff) return { kind: 'IPv4-mapped (::ffff:0:0/96)', notes: ['Represents IPv4 address ' + v4of(g[6], g[7]) + ' inside an IPv6 socket.'], flags: { mapped: v4of(g[6], g[7]) } };
    if ((g[0] & 0xffc0) === 0xfe80) return { kind: 'Link-local unicast (fe80::/10)', notes: ['Only valid on one link. Needs a zone id like %eth0 when you connect.'], flags: { linklocal: true } };
    if ((g[0] & 0xfe00) === 0xfc00) return { kind: 'Unique local (fc00::/7)', notes: ['Private network space, like 10.0.0.0/8. In practice fd00::/8 is used.'], flags: { ula: true } };
    if ((g[0] & 0xff00) === 0xff00) {
      var sc = { 1: 'interface-local', 2: 'link-local', 4: 'admin-local', 5: 'site-local', 8: 'organization-local', 14: 'global' }[g[0] & 15] || 'scope ' + (g[0] & 15);
      var n = ['Scope: ' + sc + '. Flags nibble: ' + ((g[0] >> 4) & 15).toString(16) + '.'];
      if (g[0] === 0xff02 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 1 && (g[6] & 0xff00) === 0xff00) n.push('Solicited-node multicast for an address ending in ' + hex(g[6] & 255) + ':' + hex(g[7]) + ' (used by neighbor discovery).');
      return { kind: 'Multicast (ff00::/8)', notes: n, flags: { multicast: true } };
    }
    if (g[0] === 0x2001 && g[1] === 0x0db8) return { kind: 'Documentation (2001:db8::/32)', notes: ['Reserved for examples. Never routed.'], flags: {} };
    if (g[0] === 0x2002) return { kind: '6to4 (2002::/16)', notes: ['Embeds IPv4 address ' + v4of(g[1], g[2]) + '. Deprecated transition mechanism (RFC 7526).'], flags: { sixtofour: v4of(g[1], g[2]) } };
    if (g[0] === 0x2001 && g[1] === 0) {
      var srv = v4of(g[2], g[3]), cli = v4of(g[6] ^ 0xffff, g[7] ^ 0xffff);
      return { kind: 'Teredo (2001::/32)', notes: ['Server ' + srv + ', client (de-obfuscated) ' + cli + ', UDP port ' + (g[5] ^ 0xffff) + '.'], flags: { teredo: [srv, cli] } };
    }
    if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) return { kind: 'NAT64 well-known prefix (64:ff9b::/96)', notes: ['Embeds IPv4 address ' + v4of(g[6], g[7]) + '.'], flags: {} };
    if (g.slice(0, 6).every(function (x) { return x === 0; })) return { kind: 'IPv4-compatible (::/96, deprecated)', notes: ['Deprecated since RFC 4291. Do not use.'], flags: {} };
    if ((g[0] & 0xe000) === 0x2000) return { kind: 'Global unicast (2000::/3)', notes: ['Routable on the public internet (unless it falls in a special block).'], flags: {} };
    return { kind: 'Reserved or unassigned', notes: ['Not in 2000::/3, and no special block matches.'], flags: {} };
  }
  function split64(g) { return { net: g.slice(0, 4).map(hex).join(':') + '::/64', iid: g.slice(4).map(hex).join(':'), eui64: (g[5] & 0xff) === 0xff && (g[6] & 0xff00) === 0xfe00 }; }
  function analyze(input) {
    var p = parse(input);
    if (!p.ok) return p;
    var g = p.groups;
    return { ok: true, p: p, canonical: canonical(g), expanded: expanded(g), reverse: reversePtr(g), cls: classify(g), s64: split64(g), isCanonicalInput: String(input).trim() === canonical(g) };
  }
  var api = { parse: parse, canonical: canonical, expanded: expanded, reversePtr: reversePtr, classify: classify, split64: split64, analyze: analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.V6Why = api;
})(typeof window !== 'undefined' ? window : this);
