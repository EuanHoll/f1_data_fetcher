import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from fastf1 import get_session
from datetime import datetime
import pandas as pd
import os

current_file_path = os.path.realpath(__file__)

def is_number(s):
    return s.isdigit()

def cli():

    def get_f1_data():
        year = year_entry.get()
        race_number = race_number_entry.get()
        session = session_combo.get()

        # Check if all form fields have been filled out
        if not year or not race_number or not session:
            messagebox.showerror("Error", "Please fill out all fields.")
            return

        # Disable the button and change its text while the data is being fetched
        get_data_button.config(state="disabled", text="Loading...")

        year = int(year)
        race_number = int(race_number)
        session = session_dict[session]

        # Check if year is in the future
        current_year = datetime.now().year
        if year > current_year:
            messagebox.showerror("Error", f"Cannot fetch data for future year. Current year is {current_year}.")
            return

        # Get the session data
        try:
            session_data = get_session(year, race_number, session)
            session_data.load()
        except Exception as e:
            messagebox.showerror("Error", str(e))
            return
        finally:
            # Re-enable the button and change its text back
            get_data_button.config(state="normal", text="Get F1 Data")

        # Save the session data to CSV
        filename = filedialog.asksaveasfilename(
            defaultextension=".csv", 
            filetypes=[('CSV Files', '*.csv')], 
            initialfile=f"{session}_{race_number}_{year}.csv"
        )
        if filename:
            session_data.laps.to_csv(filename)

    # Create the main window
    window = tk.Tk()
    window.title("F1 Data Fetcher")
    window.geometry("400x300")
    window.resizable(True, True)
    window.iconbitmap(os.path.join(current_file_path, "..", "logo.ico"))

    # Add some style
    style = ttk.Style(window)
    style.configure("TFrame", background="#333")
    style.configure("TLabel", background="#333", foreground="#fff", font=("Arial", 14))
    style.configure("TButton", background="#0288d1", foreground="#000", font=("Arial", 12, 'bold'))
    style.configure("TEntry", fieldbackground="#666", foreground="#000", font=("Arial", 12))
    style.configure("TCombobox", fieldbackground="#666", foreground="#000", font=("Arial", 12))

    validate = window.register(is_number)
    
    # Create a frame for the entry fields
    frame = ttk.Frame(window, padding="20")
    frame.pack(fill="both", expand=True)

    # Create a title for the application
    title = ttk.Label(frame, text="F1 Data Fetcher", font=("Arial", 24), padding="10")
    title.grid(row=0, column=0, columnspan=2)

    # Create a dictionary for session types
    session_dict = {"Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3", "Qualifying": "Q", "Race": "R"}

    # Create entry fields for year, race number, and session
    year_label = ttk.Label(frame, text="Year:", padding="5")
    year_label.grid(row=1, column=0, sticky="w")
    year_entry = ttk.Entry(frame, validate="key", validatecommand=(validate, '%P'))
    year_entry.grid(row=1, column=1, sticky="ew", padx=5, pady=5)

    race_number_label = ttk.Label(frame, text="Race Number:", padding="5")
    race_number_label.grid(row=2, column=0, sticky="w")
    race_number_entry = ttk.Entry(frame, validate="key", validatecommand=(validate, '%P'))
    race_number_entry.grid(row=2, column=1, sticky="ew", padx=5, pady=5)

    session_label = ttk.Label(frame, text="Session:", padding="5")
    session_label.grid(row=3, column=0, sticky="w")
    session_combo = ttk.Combobox(frame, values=list(session_dict.keys()), state="readonly")
    session_combo.grid(row=3, column=1, sticky="ew", padx=5, pady=5)

    # Create a button that calls get_f1_data when clicked
    get_data_button = ttk.Button(frame, text="Get F1 Data", command=get_f1_data)
    get_data_button.grid(row=4, column=0, columnspan=2, pady=10)

    # Configure the grid to expand properly when the window is resized
    frame.columnconfigure(1, weight=1)
    window.columnconfigure(0, weight=1)

    # Run the main loop
    window.mainloop()

if __name__ == "__main__":
    cli()
