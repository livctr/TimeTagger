# TimeTagger

A minimal tool for temporal annotation of local videos.

## Features
- Annotate start/end/keyframe times on local videos
- Efficient UI for data annotation
- Hotkeys for fast annotation
- Saves annotations to CSV

## Setup

### 1. Create Conda Environment
```bash
conda env create -f environment.yml
conda activate timetagger
```

### 2. Install Frontend Dependencies
```bash
cd frontend
npm install
```

### 3. Run Backend
```bash
cd backend
python app.py
```

### 4. Run Frontend
```bash
cd frontend
npm start
```

---

## File Structure
- `backend/` - Flask backend
- `frontend/` - React + videojs frontend
- `environment.yml` - Conda environment 