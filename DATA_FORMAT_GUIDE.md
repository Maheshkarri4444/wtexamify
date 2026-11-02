# Data format guide (Examify 2.0 · viva)

Templates with example rows can be downloaded from **Exam → Questions → Template**. Every import shows a row-by-row report (what's ready, what's skipped and why) before anything is added.

## Questions spreadsheet

First sheet, one question per row. Header names are matched loosely (`Option A`, `option_a`, `a` and `option 1` all work).

| Column | Required | What to put in it |
| --- | --- | --- |
| `type` | no | `mcq_single`, `mcq_multi` or `fill`. Left empty, it's worked out: options with one answer letter → single, several letters → multiple, no options → fill in the blank. |
| `question` | yes | The question. For fill in the blank, mark the blank with `____`. |
| `option_a` … `option_f` | MCQs | Up to six options (eight in the editor). Empty cells are skipped. |
| `answer` | yes | MCQ: the correct letter (`B`) or letters (`A,C`, `A C`, `AC`). The option's text also works. Fill in the blank: the accepted answer; separate alternatives with `\|` (`program counter \| PC`). |
| `difficulty` | no | `easy`, `medium` or `hard` (or `e`/`m`/`h`). Needed only when sets are balanced by difficulty; untagged questions count as medium. |
| `marks` | no | Defaults to 1. |

Example:

| type | question | option_a | option_b | option_c | option_d | answer | difficulty | marks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mcq_single | Which register holds the address of the next instruction? | Accumulator | Program Counter | Instruction Register | MAR | B | easy | 1 |
| mcq_multi | Which of these memories are volatile? | RAM | ROM | Cache | Flash | A,C | medium | 2 |
| fill | The ____ holds the address of the next instruction. | | | | | program counter \| PC | easy | 1 |

Rows are skipped (with the reason shown) when the question is empty, an MCQ has fewer than two options, the answer can't be read or points at an empty option, a single-correct question lists several answers, or the question is already in the exam.

## How answers are marked

- **Single correct:** full marks for the right option, otherwise 0.
- **Multiple correct:** partial marks, never negative. The exam setting picks the rule:
  - *Partial, wrong tick = 0* (default): any wrong tick scores 0 for that question; otherwise marks × correct ticks ÷ correct options.
  - *Partial, wrong ticks subtract:* marks × (correct ticks − wrong ticks) ÷ correct options, at least 0.
- **Fill in the blank:** capital letters, all spaces and a trailing full stop are ignored, so `Program Counter.` matches `programcounter`. Other punctuation counts (`C++` ≠ `C`).

## Students spreadsheet (or paste)

Any layout, any sheet: every email and RGUKT roll number found is picked up, and names, headers and other text are ignored. `N210368` becomes `n210368@rguktn.ac.in`. Only students on an exam's list can see or write it.

## How sets are made

The teacher sets the questions per set (and optionally how many easy/medium/hard). The number of sets is the smallest number that uses every question at least once. Questions are used up before any is repeated; when a difficulty runs short (or the last set is short), it's topped up with the least-used questions **of the same difficulty**, never twice in one set. Sets are dealt to students in roll-number order, so neighbours get different sets, and question and option order is shuffled per student.

Sets are rebuilt and re-dealt whenever questions or the blueprint change, until the first student starts. From then on questions, blueprint and sets are locked; students can still be added (they join the emptiest set).

## Where the data lives

MongoDB collections `v2_exams` (questions, blueprint, sets, students, settings) and `v2_attempts` (one per student per exam: their paper, answers, events and score), in the database named by `DB_NAME`. The v1 collections are untouched.
