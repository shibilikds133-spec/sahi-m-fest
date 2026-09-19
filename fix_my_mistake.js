const fs = require("fs");
let content = fs.readFileSync("original_trigger.sql", "utf8");

// We want to replace the strict update block
// from: OR NEW.is_final IS DISTINCT FROM OLD.is_final
// to:   AND NEW.is_final IS TRUE

// Find the exact block in original_trigger.sql:
/*
  IF TG_OP = 'UPDATE'
     AND OLD.is_final IS TRUE
     AND (
       NEW.criteria_scores IS DISTINCT FROM OLD.criteria_scores
       OR NEW.total_mark IS DISTINCT FROM OLD.total_mark
       OR NEW.entry_mode_snapshot IS DISTINCT FROM OLD.entry_mode_snapshot
       OR NEW.max_mark_snapshot IS DISTINCT FROM OLD.max_mark_snapshot
       OR NEW.criteria_snapshot IS DISTINCT FROM OLD.criteria_snapshot
       OR NEW.is_final IS DISTINCT FROM OLD.is_final
       OR NEW.is_draft IS DISTINCT FROM OLD.is_draft
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     )
  THEN
*/

const targetBlock = `  IF TG_OP = 'UPDATE'
     AND OLD.is_final IS TRUE
     AND (
       NEW.criteria_scores IS DISTINCT FROM OLD.criteria_scores
       OR NEW.total_mark IS DISTINCT FROM OLD.total_mark
       OR NEW.entry_mode_snapshot IS DISTINCT FROM OLD.entry_mode_snapshot
       OR NEW.max_mark_snapshot IS DISTINCT FROM OLD.max_mark_snapshot
       OR NEW.criteria_snapshot IS DISTINCT FROM OLD.criteria_snapshot
       OR NEW.is_final IS DISTINCT FROM OLD.is_final
       OR NEW.is_draft IS DISTINCT FROM OLD.is_draft
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     )`;

const newBlock = `  IF TG_OP = 'UPDATE'
     AND OLD.is_final IS TRUE
     AND NEW.is_final IS TRUE
     AND (
       NEW.criteria_scores IS DISTINCT FROM OLD.criteria_scores
       OR NEW.total_mark IS DISTINCT FROM OLD.total_mark
       OR NEW.entry_mode_snapshot IS DISTINCT FROM OLD.entry_mode_snapshot
       OR NEW.max_mark_snapshot IS DISTINCT FROM OLD.max_mark_snapshot
       OR NEW.criteria_snapshot IS DISTINCT FROM OLD.criteria_snapshot
       OR NEW.is_draft IS DISTINCT FROM OLD.is_draft
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     )`;

if (content.includes(targetBlock)) {
    content = content.replace(targetBlock, newBlock);
} else {
    // maybe CRLF differences
    const targetBlock2 = targetBlock.replace(/\n/g, "\r\n");
    if (content.includes(targetBlock2)) {
        content = content.replace(targetBlock2, newBlock.replace(/\n/g, "\r\n"));
    } else {
        console.error("Could not find the target block to replace.");
        process.exit(1);
    }
}

fs.writeFileSync("restored_trigger.sql", content, "utf8");
console.log("Created restored_trigger.sql successfully");
