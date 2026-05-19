const data = JSON.parse(require('fs').readFileSync('next-data.json', 'utf8'));

function printKeys(obj, prefix='', depth=0) {
  if (depth > 4) return;
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    console.log(prefix + '[] (' + obj.length + ' items)');
    if (obj.length > 0) printKeys(obj[0], prefix + '[0].', depth+1);
    return;
  }
  for (const k of Object.keys(obj).slice(0, 20)) {
    const v = obj[k];
    if (Array.isArray(v)) {
      console.log(prefix + k + ': [] (' + v.length + ' items)');
      if (v.length > 0) printKeys(v[0], prefix + k + '[0].', depth+1);
    } else if (v && typeof v === 'object') {
      console.log(prefix + k + ': {}');
      printKeys(v, prefix + k + '.', depth+1);
    } else {
      const val = String(v).slice(0, 80);
      console.log(prefix + k + ': ' + val);
    }
  }
}

printKeys(data.props);
