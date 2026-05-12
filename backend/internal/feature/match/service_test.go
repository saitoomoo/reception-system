package match

import (
	"testing"

	"reception-system/internal/db"
)

// ticketRow is a shorthand for building test inputs.
func ticketRow(id int64, seq, count int32) db.ListWaitingPublicTicketsByBoothRow {
	return db.ListWaitingPublicTicketsByBoothRow{
		ID:               id,
		SequenceInBooth:  seq,
		ParticipantCount: count,
	}
}

func TestSelectMatchGroup_ExactMatch(t *testing.T) {
	tickets := []db.ListWaitingPublicTicketsByBoothRow{
		ticketRow(1, 1, 3),
		ticketRow(2, 2, 1),
		ticketRow(3, 3, 1),
	}
	ids, total, ok := selectMatchGroup(tickets, 5)
	if !ok {
		t.Fatal("expected match to be formed")
	}
	if total != 5 {
		t.Errorf("total = %d, want 5", total)
	}
	if len(ids) != 3 {
		t.Errorf("selected %d tickets, want 3", len(ids))
	}
}

func TestSelectMatchGroup_NotEnough(t *testing.T) {
	tickets := []db.ListWaitingPublicTicketsByBoothRow{
		ticketRow(1, 1, 2),
		ticketRow(2, 2, 1),
	}
	_, _, ok := selectMatchGroup(tickets, 5)
	if ok {
		t.Fatal("expected no match with only 3 participants (target=5)")
	}
}

func TestSelectMatchGroup_Empty(t *testing.T) {
	_, _, ok := selectMatchGroup(nil, 5)
	if ok {
		t.Fatal("expected no match with empty ticket list")
	}
}

func TestSelectMatchGroup_OverflowFirstGroup(t *testing.T) {
	// T1(4) + T2(3) = 7 > target=5. T1 alone is 4 < 5. No auto-match (MVP: stop at overflow).
	tickets := []db.ListWaitingPublicTicketsByBoothRow{
		ticketRow(1, 1, 4),
		ticketRow(2, 2, 3),
	}
	_, _, ok := selectMatchGroup(tickets, 5)
	if ok {
		t.Fatal("expected no match when adding next group overflows target_party_size")
	}
}

func TestSelectMatchGroup_PartialThenExact(t *testing.T) {
	// T1(2) + T2(2) + T3(1) = 5 == target=5
	tickets := []db.ListWaitingPublicTicketsByBoothRow{
		ticketRow(1, 1, 2),
		ticketRow(2, 2, 2),
		ticketRow(3, 3, 1),
	}
	ids, total, ok := selectMatchGroup(tickets, 5)
	if !ok {
		t.Fatal("expected match to be formed")
	}
	if total != 5 {
		t.Errorf("total = %d, want 5", total)
	}
	if len(ids) != 3 {
		t.Errorf("selected %d tickets, want 3", len(ids))
	}
	_ = ids
}

func TestSelectMatchGroup_SingleTicketExact(t *testing.T) {
	// target=3, single ticket with 3 people → exact match
	tickets := []db.ListWaitingPublicTicketsByBoothRow{
		ticketRow(1, 1, 3),
	}
	ids, total, ok := selectMatchGroup(tickets, 3)
	if !ok {
		t.Fatal("expected match to be formed")
	}
	if total != 3 {
		t.Errorf("total = %d, want 3", total)
	}
	if len(ids) != 1 || ids[0] != 1 {
		t.Errorf("unexpected ids: %v", ids)
	}
}

func TestSelectMatchGroup_StopsAtFirstOverflow(t *testing.T) {
	// T1(3) is fine (3 < 5). T2(4) would make 7 > 5, overflow → stop.
	// Even though T3(2) would have made 5, we stop at first overflow.
	tickets := []db.ListWaitingPublicTicketsByBoothRow{
		ticketRow(1, 1, 3),
		ticketRow(2, 2, 4),
		ticketRow(3, 3, 2),
	}
	_, _, ok := selectMatchGroup(tickets, 5)
	if ok {
		t.Fatal("expected no match: stops at first overflow, does not skip ahead")
	}
}
