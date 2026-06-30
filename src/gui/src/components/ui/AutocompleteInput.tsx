import React, { useState, useEffect, useRef } from "react";
import { Icons } from "./Icons";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  type?: string;
  required?: boolean;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value,
  onChange,
  suggestions,
  placeholder = "https://example.com",
  className = "",
  type = "text",
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on value
  useEffect(() => {
    if (!value) {
      setFilteredSuggestions(suggestions);
    } else {
      const filtered = suggestions.filter((suggestion) =>
        suggestion.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
    }
  }, [value, suggestions]);

  // Handle clicking outside of the component to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
        break;
      case "Enter":
        if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
          e.preventDefault();
          onChange(filteredSuggestions[highlightedIndex]);
          setIsOpen(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "Tab":
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setIsOpen(false);
  };

  // Helper to highlight search term in suggestion
  const highlightMatch = (text: string, search: string) => {
    if (!search) return <span className="font-mono text-sm">{text}</span>;
    const index = text.toLowerCase().indexOf(search.toLowerCase());
    if (index === -1) return <span className="font-mono text-sm">{text}</span>;

    const before = text.substring(0, index);
    const match = text.substring(index, index + search.length);
    const after = text.substring(index + search.length);

    return (
      <span className="font-mono text-sm">
        {before}
        <span className="bg-primary/20 text-primary font-bold rounded-sm px-0.5">{match}</span>
        {after}
      </span>
    );
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          className={`${className} pr-10`}
        />
        {suggestions.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setIsOpen((prev) => !prev)}
            className="absolute right-3 p-1 rounded-md text-on-surface/30 hover:text-on-surface/60 transition-colors focus:outline-none"
          >
            <Icons.ChevronDown className={`w-4 h-4 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {isOpen && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-60 overflow-y-auto bg-surface-lowest border border-on-surface/10 rounded-lg shadow-lg divide-y divide-on-surface/5 animate-in fade-in slide-in-from-top-1.5 duration-100">
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-left transition-all ${
                index === highlightedIndex
                  ? "bg-primary/5 text-primary"
                  : "text-on-surface/80 hover:bg-on-surface/5"
              }`}
            >
              <Icons.Globe className={`w-3.5 h-3.5 shrink-0 ${index === highlightedIndex ? 'text-primary' : 'text-on-surface/30'}`} />
              <div className="truncate flex-1">
                {highlightMatch(suggestion, value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
