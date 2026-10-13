"use client";

import {useEffect, useRef, useState} from "react";
import {ChevronDown, X} from "lucide-react";
import {normalizeName} from "../lib/vehicle-catalog";
import styles from "./vehicle-combobox.module.css";

interface VehicleOption {id: string; displayName: string; make: string; model: string}
interface Props {
  id: string;
  value: string;
  options: readonly VehicleOption[];
  onChange: (id: string) => void;
}

export default function VehicleCombobox({id, value, options, onChange}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = options.find(option => option.id === value);
  const terms = normalizeName(query).split(" ").filter(Boolean);
  const matches = options.filter(option => terms.every(term =>
    normalizeName(`${option.make} ${option.model} ${option.displayName}`).includes(term)));
  const listId = `${id}-options`;
  const activeId = matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined;

  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView({block: "nearest"});
  }, [open, activeId]);

  function showOptions() {
    if (!open) {setQuery(""); setActiveIndex(0); setOpen(true);}
  }
  function choose(option: VehicleOption) {
    onChange(option.id);
    setOpen(false);
    setQuery("");
  }

  return <div ref={root} className={styles.root} onBlur={event => {
    if (!root.current?.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className={styles.control}>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? activeId : undefined}
        autoComplete="off"
        placeholder="Search or select a vehicle"
        value={open ? query : selected?.displayName ?? ""}
        onFocus={showOptions}
        onClick={showOptions}
        onChange={event => {setQuery(event.target.value); setActiveIndex(0); setOpen(true);}}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {showOptions(); return;}
            if (matches.length) setActiveIndex(index =>
              (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (matches[activeIndex]) choose(matches[activeIndex]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault(); setOpen(false);
          }
        }}
      />
      {(value || (open && query)) && <button type="button" className={styles.clear}
        aria-label="Clear vehicle selection" onMouseDown={event => event.preventDefault()}
        onClick={() => {onChange(""); setQuery(""); setActiveIndex(0); setOpen(true); input.current?.focus();}}>
        <X size={15} aria-hidden="true" />
      </button>}
      <button type="button" className={styles.toggle} tabIndex={-1}
        aria-label={open ? "Close vehicle options" : "Open vehicle options"}
        onMouseDown={event => event.preventDefault()}
        onClick={() => {if (open) setOpen(false); else {showOptions(); input.current?.focus();}}}>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
    </div>
    {open && <div className={styles.dropdown}>
      <ul id={listId} role="listbox" aria-label="Vehicle options" className={styles.options}>
        {matches.map((option, index) => <li key={option.id} role="presentation">
          <button type="button" role="option" id={`${listId}-${option.id}`} tabIndex={-1}
            aria-selected={option.id === value}
            className={`${styles.option} ${index === activeIndex ? styles.active : ""}`}
            onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(option)}>{option.displayName}</button>
        </li>)}
      </ul>
      {!matches.length && <p className={styles.empty} role="status">No matching vehicles. Try another name.</p>}
    </div>}
  </div>;
}
