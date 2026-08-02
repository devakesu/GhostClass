import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../form";
import { Input } from "../input";

describe("Form Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  const TestForm = () => {
    const form = useForm({
      defaultValues: {
        test: "",
      },
    });

    return (
      <Form {...form}>
        <FormField
          control={form.control}
          name="test"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Test Label</FormLabel>
              <FormControl>
                <Input placeholder="test placeholder" {...field} />
              </FormControl>
              <FormDescription>Test Description</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    );
  };

  it("renders correctly", () => {
    render(<TestForm />);
    expect(screen.getByText("Test Label")).toBeDefined();
    expect(screen.getByPlaceholderText("test placeholder")).toBeDefined();
    expect(screen.getByText("Test Description")).toBeDefined();
  });

  it("shows error message when validation fails", async () => {
    const ErrorForm = () => {
      const form = useForm({
        defaultValues: {
          test: "",
        },
      });

      // Manually set error
      React.useEffect(() => {
        form.setError("test", { message: "Test Error" });
      }, [form]);

      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="test"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Test Label</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<ErrorForm />);
    expect(await screen.findByText("Test Error")).toBeDefined();
  });
});
