from fastapi import FastAPI, HTTPException, Query
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
async def get_dataset(request: Dict[str, Any]):
    try:
        dataset_path = request.get("dataset_path")
        is_local = request.get("is_local", False)
        page = request.get("page", 1)
        page_size = request.get("page_size", 10)
        filters = request.get("filters", {})
        
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
        
        # Apply filters
        if filters:
            filtered_data = []
            for idx, item in enumerate(dataset):
                include_item = True
                for column, filter_value in filters.items():
                    item_value = str(item.get(column, "")).lower()
                    filter_value = str(filter_value).lower()
                    if filter_value not in item_value:
                        include_item = False
                        break
                if include_item:
                    # Add the original index to the item
                    item_with_index = dict(item)
                    item_with_index['_index'] = idx
                    filtered_data.append(item_with_index)
            total_rows = len(filtered_data)
        else:
            filtered_data = dataset
            total_rows = len(dataset)
        
        # Calculate pagination
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        # Get the data for the current page
        if filters:
            page_data = filtered_data[start_idx:end_idx]
        else:
            # For unfiltered data, add indices to the items
            page_data = []
            for i in range(start_idx, min(end_idx, total_rows)):
                item = dict(dataset[i])
                item['_index'] = i
                page_data.append(item)
        
        total_pages = (total_rows + page_size - 1) // page_size
        
        return {
            "data": page_data,
            "total_rows": total_rows,
            "total_pages": total_pages,
            "current_page": page
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/dataset/columns")
async def get_dataset_columns(dataset_path: str, is_local: bool = False):
    try:
        if is_local:
            if not os.path.exists(dataset_path):
                raise HTTPException(status_code=404, detail="Local dataset not found")
            # Check if it's a JSONL file
            if dataset_path.lower().endswith('.jsonl') or dataset_path.lower().endswith('.json'):
                dataset = datasets.load_dataset('json', data_files=dataset_path)
                if isinstance(dataset, datasets.DatasetDict):
                    dataset = list(dataset.values())[0]
            else:
                dataset = datasets.load_from_disk(dataset_path)
        else:
            try:
                # Try loading with default split first
                dataset = datasets.load_dataset(dataset_path, split="train", cache_dir=cache_dir)
            except Exception as e:
                try:
                    # If that fails, try loading without specifying a split
                    dataset = datasets.load_dataset(dataset_path, cache_dir=cache_dir)
                    # If the dataset has a 'test' split (like OpenAI HumanEval), use that
                    if 'test' in dataset:
                        dataset = dataset['test']
                    # Otherwise use the first available split
                    else:
                        splits = list(dataset.keys())
                        if splits:
                            dataset = dataset[splits[0]]
                        else:
                            raise HTTPException(status_code=400, detail="No valid splits found in dataset")
                except Exception as e2:
                    raise HTTPException(status_code=500, detail=f"Failed to load dataset: {str(e2)}")
        
        return {"columns": list(dataset.features.keys())}
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