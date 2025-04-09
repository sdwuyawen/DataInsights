from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import datasets
import pandas as pd
import os
from pathlib import Path
from dotenv import load_dotenv
import json
import re

# Load environment variables
load_dotenv()

# Set Hugging Face cache directory
cache_dir = os.getenv('HF_DATASETS_CACHE', os.path.expanduser('~/.cache/huggingface/datasets'))
os.environ['HF_DATASETS_CACHE'] = cache_dir

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

class DatasetRequest(BaseModel):
    dataset_path: str
    is_local: bool = False
    page: int = 1
    page_size: int = 10
    filters: Optional[Dict[str, Any]] = None

@app.get("/")
async def read_root():
    return FileResponse("static/index.html")

@app.post("/api/dataset")
async def load_dataset(request: Request):
    data = await request.json()
    dataset_path = data.get("dataset_path")
    is_local = data.get("is_local", False)
    page = data.get("page", 1)
    page_size = data.get("page_size", 10)
    filters = data.get("filters", {})

    try:
        if is_local:
            # Check if the path exists
            if not os.path.exists(dataset_path):
                raise HTTPException(status_code=404, detail=f"Dataset path not found: {dataset_path}")
            
            # Check if it's a JSON file
            if dataset_path.lower().endswith('.jsonl') or dataset_path.lower().endswith('.json'):
                dataset = datasets.load_dataset("json", data_files=dataset_path)
            else:
                # Check if it's an Arrow dataset directory
                if os.path.isdir(dataset_path) and os.path.exists(os.path.join(dataset_path, "dataset_info.json")):
                    dataset = datasets.load_from_disk(dataset_path)
                else:
                    raise HTTPException(
                        status_code=400, 
                        detail="Invalid dataset format. Please provide either a JSON/JSONL file or a valid Arrow dataset directory."
                    )
        else:
            # Load from Hugging Face
            dataset = datasets.load_dataset(dataset_path)

        # Handle DatasetDict by selecting the first split if it's a DatasetDict
        if isinstance(dataset, datasets.DatasetDict):
            # Get the first available split (usually 'train')
            split_name = next(iter(dataset.keys()))
            dataset = dataset[split_name]

        # Apply filters
        if filters:
            filtered_data = []
            for item in dataset:
                match = True
                for key, value in filters.items():
                    if key.endswith('_regex'):
                        # Handle regex filter
                        column = key[:-5]  # Remove '_regex' suffix
                        if column in item:
                            try:
                                if not re.search(value, str(item[column])):
                                    match = False
                                    break
                            except re.error:
                                match = False
                                break
                    else:
                        # Handle exact match filter
                        if key in item and str(item[key]) != str(value):
                            match = False
                            break
                if match:
                    filtered_data.append(item)
            dataset = filtered_data
        else:
            dataset = list(dataset)

        # Calculate pagination
        total_rows = len(dataset)
        total_pages = (total_rows + page_size - 1) // page_size
        start_idx = (page - 1) * page_size
        end_idx = min(start_idx + page_size, total_rows)

        # Get the page of data
        page_data = dataset[start_idx:end_idx]

        # Add row numbers to the data
        for i, item in enumerate(page_data):
            item['_index'] = start_idx + i

        return {
            "data": page_data,
            "total_rows": total_rows,
            "total_pages": total_pages,
            "current_page": page
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dataset/columns")
async def get_dataset_columns(dataset_path: str, is_local: bool = False):
    try:
        if is_local:
            if not os.path.exists(dataset_path):
                raise HTTPException(status_code=404, detail="Local dataset not found")
            # Check if it's a JSONL file
            if dataset_path.lower().endswith('.jsonl') or dataset_path.lower().endswith('.json'):
                dataset = datasets.load_dataset('json', data_files=dataset_path)
            else:
                dataset = datasets.load_from_disk(dataset_path)
        else:
            dataset = datasets.load_dataset(dataset_path)

        # Handle DatasetDict by selecting the first split if it's a DatasetDict
        if isinstance(dataset, datasets.DatasetDict):
            # Get the first available split (usually 'train')
            split_name = next(iter(dataset.keys()))
            dataset = dataset[split_name]

        # Get columns from the dataset
        if hasattr(dataset, 'features'):
            columns = list(dataset.features.keys())
        else:
            # If features attribute doesn't exist, get columns from the first item
            first_item = next(iter(dataset), {})
            columns = list(first_item.keys()) if first_item else []

        return {"columns": columns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dataset/unique-values")
async def get_unique_values(dataset_path: str, column: str, is_local: bool = False):
    try:
        # Load the dataset
        if is_local:
            if dataset_path.lower().endswith('.jsonl') or dataset_path.lower().endswith('.json'):
                dataset = datasets.load_dataset('json', data_files=dataset_path)
            else:
                dataset = datasets.load_from_disk(dataset_path)
        else:
            dataset = datasets.load_dataset(dataset_path)
        
        # Get the first split if multiple splits exist
        if isinstance(dataset, datasets.DatasetDict):
            dataset = list(dataset.values())[0]
        
        # Get unique values for the column
        unique_values = set()
        for item in dataset:
            value = item.get(column)
            if value is not None:
                # Convert to string and limit length for display
                str_value = str(value)[:100]
                unique_values.add(str_value)
        
        return {"values": list(unique_values)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 