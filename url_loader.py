import csv
import os
from urllib.parse import urlparse


class URLLoader:
    def __init__(self):
        self.urls = []
    
    def load_urls_from_csv(self, file_path):
        if not file_path:
            raise ValueError("CSV file path is required")
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"CSV file not found: {file_path}")
        
        if not file_path.lower().endswith('.csv'):
            raise ValueError(f"Invalid file type. Expected .csv, got {os.path.splitext(file_path)[1]}")
        
        self.urls = []
        results = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                reader = csv.DictReader(file)
                for row in reader:
                    for value in row.values():
                        if self.is_valid_url(value):
                            results.append(value)
            
            self.urls = list(set(results))
            print(f"Loaded {len(self.urls)} unique URLs from {file_path}")
            return self.urls
            
        except Exception as e:
            raise Exception(f"Error reading CSV file: {str(e)}")
    
    def is_valid_url(self, string):
        try:
            result = urlparse(string)
            return result.scheme in ['http', 'https'] and result.netloc
        except:
            return False
    
    def get_urls(self):
        return self.urls
    
    def get_url_count(self):
        return len(self.urls)
    
    def clear_urls(self):
        self.urls = []