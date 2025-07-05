from url_loader import URLLoader


def example():
    loader = URLLoader()
    
    try:
        urls = loader.load_urls_from_csv('./sample.csv')
        print('Loaded URLs:', urls)
        print('Total URLs in memory:', loader.get_url_count())
    except Exception as error:
        print(f'Error: {error}')


if __name__ == "__main__":
    example()