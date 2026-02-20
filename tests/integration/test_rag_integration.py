"""
Integration tests for RAG document intelligence.
Tests intent routing, mode detection, and document-grounded interactions.
"""


# --- Intent Routing -- Trigger Pattern Tests ---


class TestIntentRouting:
    """Test that trigger patterns correctly classify user intent."""

    # ---- Trigger lists (mirrored from routes/chat.py for validation) ----

    TRIGGERS_NEW = [
        "simulate",
        "simulation",
        "run through",
        "visualize",
        "step through",
        "show me how",
        "show the algorithm",
        "show how",
        "show the process",
        "create a simulation",
        "create a visualization",
        "create simulation",
        "demonstrate how",
        "demonstrate the",
        "walk through",
        "walk me through",
        "animate",
        "diagram of how",
    ]

    TRIGGERS_DOCUMENT = [
        "summarize",
        "summary",
        "what does the document",
        "what does the paper",
        "what does the pdf",
        "what does this say",
        "what is this about",
        "according to the",
        "from the document",
        "from the pdf",
        "from the paper",
        "from my notes",
        "from the textbook",
        "from the slides",
        "from the file",
        "explain this section",
        "explain the section",
        "what does page",
        "define",
        "what is the definition",
        "list the",
        "describe the concept",
        "in the document",
        "in the pdf",
        "in the paper",
        "in my notes",
    ]

    TRIGGERS_DOC_SIM = [
        "simulate from",
        "visualize from",
        "step through from",
        "simulate the algorithm in",
        "simulate what",
        "simulate this",
        "show me the algorithm from",
        "visualize the algorithm from",
        "run the algorithm from",
        "step through the algorithm from",
        "simulate the process from",
        "show how it works from",
        "create a simulation from",
        "create a simulation of the",
        "from page",
        "from the document simulate",
        "from the pdf simulate",
    ]

    def test_bare_show_does_not_trigger_simulation(self):
        """CRITICAL: bare 'show' must NOT trigger simulation mode."""
        msg = "show me the summary of the document"
        msg_lower = msg.lower()
        is_new_sim = any(t in msg_lower for t in self.TRIGGERS_NEW)
        # "show me how" won't match "show me the summary"
        # "show" alone is not in triggers_new
        assert not is_new_sim, "'show me the summary' should NOT trigger simulation"

    def test_bare_create_does_not_trigger_simulation(self):
        """bare 'create' must NOT trigger simulation mode."""
        msg = "create a list of topics from the pdf"
        msg_lower = msg.lower()
        is_new_sim = any(t in msg_lower for t in self.TRIGGERS_NEW)
        # "create a simulation" won't match "create a list"
        assert not is_new_sim, "'create a list' should NOT trigger simulation"

    def test_bare_run_does_not_trigger_simulation(self):
        """bare 'run' must NOT trigger simulation mode."""
        msg = "run me through the key points in the paper"
        msg_lower = msg.lower()
        is_new_sim = any(t in msg_lower for t in self.TRIGGERS_NEW)
        # "run through" WILL match — that's correct, it's a simulation intent
        # But bare "run me through" should NOT match "run through" since "run me through" != "run through"
        # Actually "run through" IS in "run me through the key points" — let's check
        # "run through" is a substring of "run me through"? No! "run me through" contains "run" and "through" but not "run through" as a contiguous substring
        assert not is_new_sim or "run through" in msg_lower

    def test_simulate_triggers_new_simulation(self):
        """'simulate quicksort' should trigger NEW_SIMULATION."""
        msg = "simulate quicksort step by step"
        is_new_sim = any(t in msg.lower() for t in self.TRIGGERS_NEW)
        assert is_new_sim

    def test_show_me_how_triggers_simulation(self):
        """'show me how dijkstra works' should trigger simulation."""
        msg = "show me how dijkstra's algorithm works"
        is_new_sim = any(t in msg.lower() for t in self.TRIGGERS_NEW)
        assert is_new_sim

    def test_walk_me_through_triggers_simulation(self):
        """'walk me through BFS' should trigger simulation."""
        msg = "walk me through BFS traversal"
        is_new_sim = any(t in msg.lower() for t in self.TRIGGERS_NEW)
        assert is_new_sim

    def test_summarize_triggers_document_qa(self):
        """'summarize chapter 3' should trigger document Q&A."""
        msg = "summarize chapter 3"
        is_doc_qa = any(t in msg.lower() for t in self.TRIGGERS_DOCUMENT)
        assert is_doc_qa

    def test_what_does_document_say_triggers_doc_qa(self):
        """'what does the document say about sorting' should trigger doc Q&A."""
        msg = "what does the document say about sorting algorithms"
        is_doc_qa = any(t in msg.lower() for t in self.TRIGGERS_DOCUMENT)
        assert is_doc_qa

    def test_from_pdf_triggers_doc_qa(self):
        """'explain from the pdf' should trigger document Q&A."""
        msg = "explain the concept from the pdf"
        is_doc_qa = any(t in msg.lower() for t in self.TRIGGERS_DOCUMENT)
        assert is_doc_qa

    def test_simulate_from_triggers_doc_sim(self):
        """'simulate from the document' should trigger doc simulation."""
        msg = "simulate from the document the sorting algorithm"
        is_doc_sim = any(t in msg.lower() for t in self.TRIGGERS_DOC_SIM)
        assert is_doc_sim

    def test_visualize_from_triggers_doc_sim(self):
        """'visualize the algorithm from the pdf' should trigger doc simulation."""
        msg = "visualize the algorithm from the pdf"
        is_doc_sim = any(t in msg.lower() for t in self.TRIGGERS_DOC_SIM)
        assert is_doc_sim

    def test_simulate_this_triggers_doc_sim(self):
        """'simulate this' should trigger doc simulation."""
        msg = "simulate this algorithm"
        is_doc_sim = any(t in msg.lower() for t in self.TRIGGERS_DOC_SIM)
        assert is_doc_sim


# --- Mode Selection Logic Tests ---


class TestModeSelection:
    """Test mode selection logic (mirrors routes/chat.py logic)."""

    def _classify_mode(self, msg, has_pdf=False):
        """
        Replicate the mode classification logic from chat().
        Returns one of: DOCUMENT_SIMULATION, DOCUMENT_QA, NEW_SIMULATION,
        CONTINUE_SIMULATION, GENERAL_QA
        """
        triggers_new = TestIntentRouting.TRIGGERS_NEW
        triggers_continue = ["next", "continue", "proceed", "go on", "more"]
        triggers_document = TestIntentRouting.TRIGGERS_DOCUMENT
        triggers_doc_sim = TestIntentRouting.TRIGGERS_DOC_SIM

        msg_lower = msg.lower()

        is_new_sim = any(t in msg_lower for t in triggers_new)
        is_doc_sim = has_pdf and any(t in msg_lower for t in triggers_doc_sim)
        is_doc_qa = has_pdf and any(t in msg_lower for t in triggers_document)

        if is_doc_sim:
            is_new_sim = True

        if is_doc_qa and not is_new_sim and not is_doc_sim:
            is_new_sim = False

        if any(t in msg_lower for t in ["more", "next"]):
            is_new_sim = False

        is_continue = any(t in msg_lower for t in triggers_continue)

        # Mode selection
        if is_new_sim and is_doc_sim:
            return "DOCUMENT_SIMULATION"
        elif is_new_sim:
            return "NEW_SIMULATION"
        elif is_continue:
            return "CONTINUE_SIMULATION"
        elif is_doc_qa:
            return "DOCUMENT_QA"
        else:
            # Default to DOCUMENT_QA when PDF loaded, else GENERAL_QA
            return "DOCUMENT_QA" if has_pdf else "GENERAL_QA"

    def test_simulate_without_pdf_is_new_simulation(self):
        """Without PDF, 'simulate quicksort' → NEW_SIMULATION."""
        mode = self._classify_mode("simulate quicksort", has_pdf=False)
        assert mode == "NEW_SIMULATION"

    def test_simulate_from_doc_with_pdf_is_doc_sim(self):
        """With PDF, 'simulate from the document' → DOCUMENT_SIMULATION."""
        mode = self._classify_mode("simulate from the document the sorting algo", has_pdf=True)
        assert mode == "DOCUMENT_SIMULATION"

    def test_summarize_with_pdf_is_doc_qa(self):
        """With PDF, 'summarize chapter 3' → DOCUMENT_QA."""
        mode = self._classify_mode("summarize chapter 3", has_pdf=True)
        assert mode == "DOCUMENT_QA"

    def test_generic_question_with_pdf_defaults_to_doc_qa(self):
        """With PDF, generic question defaults to DOCUMENT_QA."""
        mode = self._classify_mode("what is the time complexity of this?", has_pdf=True)
        assert mode == "DOCUMENT_QA"

    def test_generic_question_without_pdf_is_general_qa(self):
        """Without PDF, generic question → GENERAL_QA."""
        mode = self._classify_mode("what is Big-O notation?", has_pdf=False)
        assert mode == "GENERAL_QA"

    def test_next_is_continue(self):
        """'next' → CONTINUE_SIMULATION."""
        mode = self._classify_mode("next step please", has_pdf=False)
        assert mode == "CONTINUE_SIMULATION"

    def test_simulate_with_pdf_but_no_doc_trigger_is_new_sim(self):
        """With PDF, 'simulate quicksort' (no doc-sim trigger) → NEW_SIMULATION."""
        mode = self._classify_mode("simulate quicksort step by step", has_pdf=True)
        assert mode == "NEW_SIMULATION"

    def test_doc_qa_does_not_trigger_simulation(self):
        """'what does the paper say about sorting' should NOT be simulation."""
        mode = self._classify_mode("what does the paper say about sorting", has_pdf=True)
        assert mode == "DOCUMENT_QA"

    def test_ambiguous_show_without_pdf(self):
        """'show me how quicksort works' → NEW_SIMULATION (no PDF context)."""
        mode = self._classify_mode("show me how quicksort works", has_pdf=False)
        assert mode == "NEW_SIMULATION"

    def test_define_with_pdf_is_doc_qa(self):
        """'define amortized analysis' with PDF → DOCUMENT_QA."""
        mode = self._classify_mode("define amortized analysis", has_pdf=True)
        assert mode == "DOCUMENT_QA"

    def test_from_page_with_pdf_is_doc_sim(self):
        """'from page 5 simulate the algorithm' with PDF → DOCUMENT_SIMULATION."""
        mode = self._classify_mode("from page 5 simulate the algorithm", has_pdf=True)
        assert mode == "DOCUMENT_SIMULATION"


# --- Word-Level Deduplication Tests ---


class TestWordDeduplication:
    """Test the word-level overlap deduplication logic used in RAG retrieval."""

    @staticmethod
    def _word_overlap(text_a, text_b):
        """Replicate the dedup logic from chat.py."""
        words_a = set(text_a.lower().split())
        words_b = set(text_b.lower().split())
        if not words_a or not words_b:
            return 0.0
        overlap = len(words_a & words_b)
        return overlap / min(len(words_a), len(words_b))

    def test_identical_texts_have_full_overlap(self):
        """Identical texts should have 100% word overlap."""
        text = "The quick brown fox jumps over the lazy dog"
        assert self._word_overlap(text, text) == 1.0

    def test_no_overlap(self):
        """Completely different texts should have 0% overlap."""
        a = "alpha beta gamma delta"
        b = "one two three four"
        assert self._word_overlap(a, b) == 0.0

    def test_high_overlap_detected(self):
        """Texts with >60% word overlap should be flagged."""
        a = "quicksort uses a pivot element to partition the array into two halves"
        b = "quicksort selects a pivot element to partition the array into sub-arrays"
        overlap = self._word_overlap(a, b)
        assert overlap > 0.6, f"Expected >60% overlap, got {overlap:.2%}"

    def test_moderate_overlap_below_threshold(self):
        """Texts with <60% overlap should NOT be flagged."""
        a = "Binary search works on sorted arrays by dividing the search space"
        b = "Hash tables provide constant time lookups using a hash function"
        overlap = self._word_overlap(a, b)
        assert overlap < 0.6, f"Expected <60% overlap, got {overlap:.2%}"

    def test_empty_text_returns_zero(self):
        """Empty text should return 0 overlap."""
        assert self._word_overlap("", "some text") == 0.0
        assert self._word_overlap("some text", "") == 0.0
        assert self._word_overlap("", "") == 0.0
