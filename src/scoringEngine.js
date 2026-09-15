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
  return Boolean(segment && segment.isBull);
}

export function isFinishThrow(throwObj) {
  if (!throwObj) return false;
  return Boolean(throwObj.isDouble || (throwObj.isBull && throwObj.value === 50));
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

const FINISH_DOUBLE_PRIORITY = [20, 16, 18, 12, 10, 8, 6, 4, 2, 19, 17, 15, 14, 13, 11, 9, 7, 5, 3, 1];
const TRIPLE_PRIORITY = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

function routeScore(route) {
  const dartCount = route.length;
  let score = (dartCount - 1) * 100000;
  const finish = route[dartCount - 1];

  if (finish.isBull) {
    score += 5000;
  } else {
    score += FINISH_DOUBLE_PRIORITY.indexOf(Number(finish.label.slice(1))) * 100;
  }

  route.slice(0, -1).forEach((dart, index) => {
    if (dart.label.startsWith("D")) score += 1800;
    else if (dart.label.startsWith("T")) {
      score += Math.max(0, TRIPLE_PRIORITY.indexOf(Number(dart.label.slice(1)))) * 5;
    } else if (dart.label.startsWith("S")) {
      score += 100 + Math.max(0, 20 - Number(dart.label.slice(1))) * 2;
    } else {
      score += 500;
    }

    if (dartCount === 3) {
      score -= dart.value * (index === 0 ? 0.4 : 0.15);
    } else {
      score -= dart.value * 0.15;
    }
  });

  return score;
}

function checkoutRoutes(remaining, dartsLeft) {
  const routes = [];
  const finishSegments = ALL_SEGMENTS.filter((segment) => segment.isDouble || (segment.isBull && segment.value === 50));

  for (const finish of finishSegments) {
    if (finish.value === remaining) routes.push([finish]);
  }

  if (dartsLeft >= 2) {
    for (const first of ALL_SEGMENTS) {
      for (const finish of finishSegments) {
        if (first.value + finish.value === remaining) routes.push([first, finish]);
      }
    }
  }

  if (dartsLeft >= 3) {
    for (const first of ALL_SEGMENTS) {
      for (const second of ALL_SEGMENTS) {
        for (const finish of finishSegments) {
          if (first.value + second.value + finish.value === remaining) routes.push([first, second, finish]);
        }
      }
    }
  }

  return routes;
}

export function findCheckout(remaining, dartsLeft) {
  if (!Number.isInteger(remaining) || remaining <= 1 || remaining > 170 || dartsLeft <= 0) return null;

  const routes = checkoutRoutes(remaining, Math.min(3, dartsLeft));
  if (!routes.length) return null;

  routes.sort((a, b) => routeScore(a) - routeScore(b));
  return routes[0].map((segment) => segment.label);
}
