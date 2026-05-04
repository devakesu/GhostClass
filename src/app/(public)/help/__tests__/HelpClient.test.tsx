import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import HelpClient from "../HelpClient";

describe("HelpClient", () => {
  it("renders the page header", () => {
    render(<HelpClient />);
    expect(screen.getByRole("heading", { name: /Help & FAQ/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Everything you need to know about GhostClass/i)
    ).toBeInTheDocument();
  });

  it("renders all five section headings", () => {
    render(<HelpClient />);
    expect(screen.getByText(/Course Card Explained/i)).toBeInTheDocument();
    expect(screen.getByText(/Correction vs Extra/i)).toBeInTheDocument();
    expect(screen.getByText(/Attendance Chart Explained/i)).toBeInTheDocument();
    expect(screen.getByText(/Frequently Asked Questions/i)).toBeInTheDocument();
    expect(screen.getByText(/Need More Help/i)).toBeInTheDocument();
  });

  describe("Mock course card", () => {
    it("shows course name and code", () => {
      render(<HelpClient />);
      expect(screen.getByText("Data Structures & Algorithms")).toBeInTheDocument();
      // CSE301 appears in both the mock card and the mock chart
      expect(screen.getAllByText("CSE301").length).toBeGreaterThanOrEqual(1);
    });

    it("shows official present count scoped to card", () => {
      render(<HelpClient />);
      const card = screen.getByTestId("mock-course-card");
      // "32" is the present count in the card (legend text says "e.g. 32" but
      // the legend renders it as inline text, not the standalone text node "32")
      expect(within(card).getByText("32")).toBeInTheDocument();
    });

    it("shows bunk calculator panels", () => {
      render(<HelpClient />);
      // "Safe (Official)" appears in both the mock card and the legend
      expect(screen.getAllByText("Safe (Official)").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("+ Tracking Data").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("FAQ accordion", () => {
    it("renders all FAQ questions collapsed by default", () => {
      render(<HelpClient />);
      const faqSection = screen.getByTestId("faq-section");
      const buttons = within(faqSection).getAllByRole("button");
      expect(buttons.length).toBe(13);
      buttons.forEach((btn) => {
        expect(btn).toHaveAttribute("aria-expanded", "false");
      });
    });

    it("expands a FAQ item when clicked", () => {
      render(<HelpClient />);
      const faqSection = screen.getByTestId("faq-section");
      const buttons = within(faqSection).getAllByRole("button");
      // Index 2 is "Why is my attendance percentage different from EzyGo?"
      const diffButton = buttons[2];
      expect(diffButton).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(diffButton);

      expect(diffButton).toHaveAttribute("aria-expanded", "true");
      // Panel is always in DOM; check it becomes visible
      expect(
        screen.getByText(
          /GhostClass shows your official data plus any manually tracked corrections/i
        )
      ).toBeVisible();
    });

    it("collapses a FAQ item when clicked again", () => {
      render(<HelpClient />);
      const faqSection = screen.getByTestId("faq-section");
      const buttons = within(faqSection).getAllByRole("button");
      const firstButton = buttons[0];

      fireEvent.click(firstButton);
      expect(firstButton).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(firstButton);
      expect(firstButton).toHaveAttribute("aria-expanded", "false");
    });

    it("renders key FAQ questions", () => {
      render(<HelpClient />);
      expect(
        screen.getByText(
          /Why is my attendance percentage different from EzyGo/i
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Does GhostClass change my real attendance/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/What is the bunk calculator/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/How do I set my target attendance/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/What does .syncing. mean/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Why does a course card show .No attendance data/i)
      ).toBeInTheDocument();
    });
  });

  describe("Correction vs Extra section", () => {
    it("renders Correction and Extra cards", () => {
      render(<HelpClient />);
      expect(screen.getByText("Correction")).toBeInTheDocument();
      expect(screen.getByText("Extra")).toBeInTheDocument();
    });
  });

  describe("Need More Help section", () => {
    it("has a contact link", () => {
      render(<HelpClient />);
      const link = screen.getByRole("link", { name: /Contact Us/i });
      expect(link).toHaveAttribute("href", "/contact");
    });
  });
});
