export interface AttendanceInsight {
  percent: number;
  canMiss: number;
  needToAttend: number; // classes to reach threshold (0 if already >=)
  status: "good" | "warning" | "critical";
}

/**
 * Predictive attendance: how many more classes can be missed while staying
 * above `threshold`, and how many consecutive classes are needed to reach it.
 */
export function attendanceInsight(
  total: number,
  attended: number,
  threshold = 75
): AttendanceInsight {
  const safeTotal = Math.max(total, 0);
  const safeAttended = Math.min(Math.max(attended, 0), safeTotal);
  const percent = safeTotal === 0 ? 0 : (safeAttended / safeTotal) * 100;

  // canMiss: largest m such that attended / (total + m) >= threshold
  let canMiss = 0;
  if (percent >= threshold) {
    if (threshold >= 100) {
      canMiss = 0;
    } else {
      canMiss = Math.floor((safeAttended * 100) / threshold - safeTotal);
      canMiss = Math.max(0, canMiss);
    }
  }

  // needToAttend: smallest n such that (attended + n) / (total + n) >= threshold
  let needToAttend = 0;
  if (percent < threshold) {
    needToAttend = Math.ceil(
      (threshold * safeTotal - 100 * safeAttended) / (100 - threshold)
    );
    needToAttend = Math.max(0, needToAttend);
  }

  const status: AttendanceInsight["status"] =
    percent >= threshold ? "good" : percent >= threshold - 10 ? "warning" : "critical";

  return {
    percent: Math.round(percent * 100) / 100,
    canMiss,
    needToAttend,
    status,
  };
}
