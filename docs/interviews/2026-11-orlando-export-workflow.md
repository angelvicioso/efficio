# Interview Guide: Export Booking Workflow (Orlando)

_Prepared: 2026-11-25 · Interviewee: Orlando (CEO) · Interviewer: Eduardo (CTO) · Time: ~45 min_
_Covers: Q-001, Q-003, Q-004 (block the first story) and Q-007, Q-008 (needed soon)_

**How to use this:** Orlando can fill it in alone, or Eduardo can run it as a call and type the answers. Write in the `>` lines. Short answers and real examples are better than polished ones. "I don't know" is a useful answer too.

---

## Part 1: Walk me through a real booking (10 min)
_Goal: understand the real workflow before asking specific questions. Think of one recent export shipment._

1. From the moment the exporter gets the booking confirmation from the carrier, what happens, step by step, until the vessel leaves?
   > 

2. At each step, **who** is involved (exporter, carrier, trucker, warehouse, terminal), and **how** do they communicate (email, portal, phone, EDI)?
   > 

3. Where did things go wrong or almost go wrong on that shipment, or on a typical one?
   > 

---

## Part 2: Which port and terminal first? (Q-001) (10 min)

4. Which ports and terminals do the exporters you know use most? List the top 3, with terminal names if you know them.
   > 

5. For each one, how does an exporter or trucker check booking status today (terminal website, eModal, Port Optimizer, carrier portal, phone)?
   > 

6. Do you know anyone at a terminal, port authority or data provider (e.g., Terminal49, Vizion, project44) who could give us access or advice? _(This feeds Q-002 for Javier.)_
   > 

7. **If you had to pick one terminal for the POC, which would it be, and why?**
   > 

---

## Part 3: What reference numbers does the exporter have? (Q-003) (5 min)

8. When the exporter starts caring about a shipment, which numbers do they have? Check all that apply and say *when* each one becomes available.

   | Reference | Exporter has it? | When does it become available? |
   |---|---|---|
   | Booking number | | |
   | Container number(s) | | |
   | Bill of lading number | | |
   | Vessel name / voyage | | |
   | Other: | | |

9. How many containers does a typical booking have? Is there ever just one booking per container?
   > 

10. When a terminal website is searched, which number do people actually type in?
    > 

---

## Part 4: What information matters most? (Q-004) (15 min)

11. **Rank these from 1 (most important) to 8 for an exporter.** Add a note on *why*, or what goes wrong when they miss it.

    | Rank | Information | Why it matters / what goes wrong |
    |---|---|---|
    | | Receiving window opens (ERD) | |
    | | Cutoffs (cargo/CY, documents, VGM) | |
    | | Terminal has the booking on file | |
    | | Container gated in at terminal | |
    | | Holds (customs, carrier, terminal) | |
    | | Loaded on vessel | |
    | | Vessel arrival/departure times | |
    | | Booking rolled / vessel changed | |
    | | _Other:_ | |

12. Which of these **change most often**, and how does the exporter usually find out?
    > 

13. What is the single most **expensive** surprise for an exporter (detention, missed vessel, storage, a rolled booking)? Roughly how much does it cost?
    > 

14. If the exporter could get **one alert** on their phone, what would it say?
    > 

---

## Part 5: Quick hits (Q-007, Q-008) (5 min)

15. Is there an exporter (company or person) who might try the POC? About how many bookings a week do they handle? _(Q-007)_
    > 

16. How often do the **carrier** and **terminal** show different information for the same booking (e.g., different cutoffs)? Would showing both side by side be valuable? _(Q-008)_
    > 

17. Is there anything we haven't asked that we should be thinking about?
    > 

---

## After the interview (Eduardo)
- [ ] Move answered questions to **Answered** in [Open questions](../02-open-questions.md) and log any decisions
- [ ] Update stories S-001 to S-004 in the [Backlog](../03-backlog.md) with acceptance criteria
- [ ] Pass contacts from Q6 and Q15 to Javier (Q-002, Q-005)
- [ ] Add any new terms to the [Glossary](../06-glossary.md)
