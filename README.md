# Code Dataset Viewer

A web application for viewing code datasets from Hugging Face or local files. The application supports pagination, filtering, and syntax highlighting for code content.

## Features

- View datasets from Hugging Face or local files
- Pagination support with configurable page size
- Filter data by any column
- Syntax highlighting for code content
- Responsive design
- Configurable dataset cache location

## Installation

1. Clone this repository
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Configuration

The application uses a `.env` file for configuration. You can customize the following settings:

- `HF_DATASETS_CACHE`: Location where Hugging Face datasets will be cached
  - Default: `~/.cache/huggingface/datasets`
  - To change: Uncomment and modify the line in `.env`

## Usage

1. Start the server:
   ```bash
   python app.py
   ```

2. Open your web browser and navigate to `http://localhost:8000`

3. To view a Hugging Face dataset:
   - Select "Hugging Face Dataset"
   - Enter the dataset path (e.g., `openai/openai_humaneval`)
   - Click "Load Dataset"

4. To view a local dataset:
   - Select "Local Dataset"
   - Enter the path to your local dataset
   - Click "Load Dataset"

5. Use the filters to search for specific content in any column

6. Adjust the number of rows per page using the dropdown menu

## Requirements

- Python 3.7+
- FastAPI
- Uvicorn
- Hugging Face Datasets
- Pandas
- python-dotenv

## License

MIT 