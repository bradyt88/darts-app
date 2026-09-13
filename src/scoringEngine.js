export const ALL_SEGMENTS = (() => {
  const segs = [];

  for (let n = 1; n <= 20; n += 1) {
    segs.push({ label: `S${n}`, value: n, isDouble: false, isBull: false });
    segs.push({ label: `D${n}`, value: n * 2, isDouble: true, isBull: false });
    segs.push({ label: `T${n}`, value: n * 3, isDouble: false, isBull: false });
  }

  segs.push({ label: "25 / Outer Bull", value: 25, isDouble: false, isBull: true });
  segs.push({ label: "D-Bull", value: 50, isDouble: true, isBull: true });

  return segs;
})();

export function isBullSegment(segment) {
  return Boolean(segment && (segment.isBull || segment.label === "25 / Outer Bull" || segment.label === "D-Bull"));
}

export function isFinishThrow(throwObj) {
  if (!throwObj) return false;
  return Boolean(throwObj.isDouble || throwObj.value === 25 || throwObj.value === 50 || isBullSegment(throwObj));
}

export function sumThrows(turnThrows) {
  return turnThrows.reduce((total, throwObj) => total + (throwObj?.value || 0), 0);
}

export function isBustThrow({ currentRemaining, turnThrows, nextThrow }) {
  if (!nextThrow) return false;

  const remainingAfterThrow = currentRemaining - (sumThrows(turnThrows) + (nextThrow.value || 0));

  if (remainingAfterThrow < 0 || remainingAfterThrow === 1) {
    return true;
  }

  if (remainingAfterThrow === 0 && !isFinishThrow(nextThrow)) {
    return true;
  }

  return false;
}

export function findCheckout(remaining, dartsLeft) {
  if (remaining <= 1 || remaining > 170 || dartsLeft <= 0) return null;

  const validFinishSegments = ALL_SEGMENTS.filter((segment) => segment.isDouble || isBullSegment(segment));

  for (const segment of validFinishSegments) {
    if (segment.value === remaining) {
      return [segment.label];
    }
  }

  if (dartsLeft >= 2) {
    for (const first of ALL_SEGMENTS) {
      for (const finish of validFinishSegments) {
        if (first.value + finish.value === remaining) {
          return [first.label, finish.label];
        }
      }
    }
  }

  if (dartsLeft >= 3) {
    for (const first of ALL_SEGMENTS) {
      for (const second of ALL_SEGMENTS) {
        for (const finish of validFinishSegments) {
          if (first.value + second.value + finish.value === remaining) {
            return [first.label, second.label, finish.label];
          }
        }
      }
    }
  }

  return null;
}
